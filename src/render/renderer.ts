// Draws the world: terrain (culled + fogged), buildings, units, projectiles, explosions, the
// placement ghost, and the selection drag box. UI chrome (sidebar/HUD/minimap) lives in ui.ts.

import type { Camera } from '../core/camera';
import type { World, Effect } from '../world/world';
import type { Building } from '../world/building';
import type { Unit } from '../world/unit';
import {
  TILE, HIT_FLASH_TIME, POPUP_RISE, HARVESTER_CAPACITY,
  WORM_RADIUS, WORM_SURFACE_TIME, WORM_SUBMERGE_TIME, WORM_REPEL_DAMAGE,
} from '../world/constants';
import type { BuildingDef, Faction } from '../world/defs';
import { Terrain } from '../world/tilemap';
import { wormSurfaced } from '../world/worm';
import type { Worm } from '../world/worm';
import {
  PLAYER_COLOR, ENEMY_COLOR, ownerAccent, ownerBodyFill, paintTerrainTile, paintUnitBody, unitShape,
  paintWorm, hash2,
} from './visuals';
import { DustPool, ScorchPool, SCORCH_LIFE } from './fx';
import type { DustKind } from './fx';

export interface ViewState {
  selected: Set<number>;
  selectedBuilding: Building | null;
  placing: { def: BuildingDef; tx: number; ty: number; valid: boolean } | null;
  aimAttackMove: boolean;
  dragRect: { x0: number; y0: number; x1: number; y1: number } | null;
}

const PLAYER = PLAYER_COLOR;
const ENEMY = ENEMY_COLOR;

// Building sprites: drop a `building-<id>.png` (top-down, sized footprint×TILE, transparent
// background — see assets/sprites/*.md specs) into assets/sprites/ and it is auto-discovered
// here, no other code change needed. A building with no matching sprite falls back to the
// procedural rectangle. Sprites replace only the base art; the engine still draws the owner
// border, HP bar, turret head, muzzle flash, selection ring, and name label on top.
const SPRITE_URLS = import.meta.glob('../../assets/sprites/building-*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;
const buildingSprites: Record<string, HTMLImageElement> = {};
for (const [path, url] of Object.entries(SPRITE_URLS)) {
  const m = path.match(/building-(.+)\.png$/);
  if (!m) continue;
  const img = new Image();
  img.src = url;
  buildingSprites[m[1]] = img; // drawn once img.complete && naturalWidth > 0
}

// Effect sprite-sheets (explosions, etc.): drop `fx-<name>.png` into assets/sprites/ as a
// horizontal strip of SQUARE frames; the engine infers frameCount = width/height and plays the
// strip across the effect's lifetime. `fx-explosion.png` animates every blast (scaled by size);
// an optional `fx-explosion-large.png` is preferred for building blasts. No sheet → the
// procedural blast below is drawn instead.
const FX_URLS = import.meta.glob('../../assets/sprites/fx-*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;
const fxSprites: Record<string, HTMLImageElement> = {};
for (const [path, url] of Object.entries(FX_URLS)) {
  const m = path.match(/fx-(.+)\.png$/);
  if (!m) continue;
  const img = new Image();
  img.src = url;
  fxSprites[m[1]] = img;
}
function fxReady(name: string): HTMLImageElement | null {
  const img = fxSprites[name];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

export class Renderer {
  // The faction this client views as "friendly" (green + fog source). 'player' for single-player
  // and the MP host; 'enemy' for a MP guest. Set per-draw; the default preserves single-player.
  private localFaction: Faction = 'player';

  // ---- renderer-owned cosmetic state (never sim state — nothing here is serialized) ---------
  private readonly dust = new DustPool();               // vehicle dust trails + mining plume
  private readonly scorch = new ScorchPool();            // ground scorch marks from blasts
  private readonly unitTrack = new Map<number, { x: number; y: number; lastDust: number; lastPlume: number }>();
  private lastPruneAt = -Infinity;
  private readonly seenForDecal = new WeakSet<Effect>(); // first-seen gate for scorch decals
  private readonly seenForShake = new WeakSet<Effect>(); // first-seen gate for camera shake
  private shakeAmp = 0;
  private shakeDur = 1;
  private shakeUntil = -Infinity;                        // world.time the current shake ends
  private lastWorld: World | null = null;                // pools are per-match: reset on a new World

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(world: World, cam: Camera, view: ViewState, localFaction: Faction = 'player'): void {
    this.localFaction = localFaction;
    // The Renderer outlives the World (restart / load / rematch replace it and its clock restarts
    // at 0), so every time-stamped cosmetic pool must be flushed on a new World or stale puffs,
    // decals, shake and dead-unit tracks would linger for the whole next match.
    if (world !== this.lastWorld) {
      this.lastWorld = world;
      this.dust.reset();
      this.scorch.reset();
      this.unitTrack.clear();
      this.lastPruneAt = -Infinity;
      this.shakeUntil = -Infinity;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cam.viewW, cam.viewH);
    ctx.clip();

    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);

    // First-seen scan drives two purely cosmetic, one-shot reactions to new effects: a scorch
    // decal pushed into the ground pool, and a camera-shake trigger. Runs before any drawing so
    // a decal spawned this frame is already in the pool when drawScorchDecals runs below.
    this.scanNewEffects(world, cam);

    // World layer only: a tiny deterministic shake offset (never mutating cam.x/cam.y) applied
    // to terrain/entities/effects. Restored before the drag box / aim banner, which are screen-
    // space UI-ish overlays and must never shake; ui.ts (sidebar/HUD/minimap) is a separate draw
    // call entirely and is untouched by this.
    const shake = this.shakeOffset(world.time);
    ctx.save();
    ctx.translate(shake.x, shake.y);

    this.drawTerrain(world, cam);
    this.drawScorchDecals(world, cam);
    for (const w of world.worms) if (!wormSurfaced(w)) this.drawWorm(w, world, cam);
    for (const b of world.buildings) this.drawBuilding(b, world, cam, view);
    for (const u of world.units) {
      this.drawUnit(u, world, cam, view);
      this.trackVehicleDust(u, world, cam);
    }
    this.pruneVehicleDust(world);
    this.drawDustParticles(cam, world.time);
    // A surfaced worm towers over everything on the ground, so it draws after units.
    for (const w of world.worms) if (wormSurfaced(w)) this.drawWorm(w, world, cam);
    this.drawOrderMarkers(world, cam, view);
    if (view.selectedBuilding) this.drawRally(view.selectedBuilding, cam);
    for (const p of world.projectiles) this.drawProjectile(p, cam);
    for (const e of world.effects) this.drawEffect(e, cam);
    if (view.placing) this.drawGhost(view.placing, cam);
    this.drawAmbientSand(cam, world.time);
    this.drawFogDim(world, cam);
    this.drawPopups(world, cam);

    ctx.restore(); // end camera-shake translate

    if (view.dragRect) this.drawDrag(view.dragRect);
    if (view.aimAttackMove) this.drawAimBanner(cam);

    ctx.restore();
  }

  // ---- camera shake (cosmetic, renderer-side only) -------------------------------------------

  private triggerShake(amp: number, dur: number, now: number): void {
    const finish = now + dur;
    if (finish >= this.shakeUntil) { // don't let a smaller/older shake cut a bigger one short
      this.shakeAmp = amp;
      this.shakeDur = dur;
      this.shakeUntil = finish;
    }
  }

  /** Deterministic decaying wobble driven by world.time (never Math.random). */
  private shakeOffset(now: number): { x: number; y: number } {
    const remain = this.shakeUntil - now;
    if (remain <= 0) return { x: 0, y: 0 };
    const amp = this.shakeAmp * Math.min(1, remain / this.shakeDur);
    return { x: Math.sin(now * 53.1) * amp, y: Math.cos(now * 47.7) * amp };
  }

  /** First-seen (via WeakSet identity) reactions to newly-appeared effects: a building-size
   *  blast or worm-surfacing spray inside the viewport triggers one camera shake; every blast
   *  (building or vehicle) leaves a scorch decal in the ground pool. Each effect object triggers
   *  each reaction at most once, however many frames it lives for. */
  private scanNewEffects(world: World, cam: Camera): void {
    for (const e of world.effects) {
      const isBlast = e.kind === 'blast' || e.kind === undefined;
      if (isBlast && !this.seenForDecal.has(e)) {
        this.seenForDecal.add(e);
        this.scorch.push(e.x, e.y, e.size >= 36 ? 22 : 10, world.time);
      }
      const bigBlast = isBlast && e.size >= 36;
      const bigSpray = e.kind === 'spray' && e.size >= 44;
      if ((bigBlast || bigSpray) && !this.seenForShake.has(e)) {
        this.seenForShake.add(e);
        const sx = e.x - cam.x, sy = e.y - cam.y;
        if (sx >= 0 && sx <= cam.viewW && sy >= 0 && sy <= cam.viewH) {
          this.triggerShake(4, 0.35, world.time);
        }
      }
    }
  }

  /** Ground scorch marks left by blast effects — drawn after terrain, before entities. Gated on
   *  "explored" (not "visible") so old marks persist in fog memory but never leak through
   *  never-explored black, matching how drawTerrain/drawFogDim treat the rest of the ground. */
  private drawScorchDecals(world: World, cam: Camera): void {
    const ctx = this.ctx;
    const now = world.time;
    for (const d of this.scorch.decals) {
      const age = now - d.born;
      if (age < 0 || age >= SCORCH_LIFE) continue;
      const sx = d.x - cam.x, sy = d.y - cam.y;
      if (sx < -d.r - 4 || sx > cam.viewW + d.r + 4 || sy < -d.r - 4 || sy > cam.viewH + d.r + 4) continue;
      if (world.config.fog) {
        const tx = Math.floor(d.x / TILE), ty = Math.floor(d.y / TILE);
        if (!world.fog.explored(tx, ty)) continue;
      }
      ctx.fillStyle = `rgba(20,16,12,${0.5 * (1 - age / SCORCH_LIFE)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** ~24 wind-blown specks drifting across the viewport — pure atmosphere, not tied to any world
   *  position, so it draws in screen space. A deterministic function of world.time + index (never
   *  Math.random), so it never desyncs a paused/resumed or replayed render. */
  private drawAmbientSand(cam: Camera, t: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(214,188,140,0.18)';
    for (let i = 0; i < 24; i++) {
      const h = hash2(i, 7);
      const speed = 12 + (h % 10);
      const drift = 5 + ((h >>> 4) % 6);
      const size = 1 + ((h >>> 8) % 2);
      const span = cam.viewW + 20, spanY = cam.viewH + 20;
      const x0 = ((h % 997) / 997) * span;
      const y0 = (((h >>> 12) % 991) / 991) * spanY;
      const x = ((x0 + t * speed) % span) - 10;
      const y = ((y0 + t * drift) % spanY) - 10;
      ctx.fillRect(x, y, size, size);
    }
  }

  // ---- sandworms -------------------------------------------------------------------------

  /** Underground 'wormsign' while roaming/hunting, or the full risen body while surfacing /
   *  devouring / submerging. A worm has no owner, so it fog-gates on the raw head-tile visibility
   *  rather than visibleEntity. Cull off-screen (generous pad for the trailing segments/mounds). */
  private drawWorm(w: Worm, world: World, cam: Camera): void {
    const headTx = Math.floor(w.x / TILE), headTy = Math.floor(w.y / TILE);
    if (world.config.fog && !world.fog.visible(headTx, headTy)) return;
    const sx = w.x - cam.x, sy = w.y - cam.y;
    const pad = WORM_RADIUS * 4;
    if (sx < -pad || sx > cam.viewW + pad || sy < -pad || sy > cam.viewH + pad) return;

    const ctx = this.ctx;
    const t = world.time;
    const surfaced = wormSurfaced(w);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(w.facing);
    if (!surfaced) {
      paintWorm(ctx, { phase: 'sign', t, seed: w.id, urgent: w.state === 'hunting' });
      ctx.restore();
      return;
    }
    let scale: number;
    let sway = 0;
    if (w.state === 'surfacing') scale = 1 - w.stateT / WORM_SURFACE_TIME;
    else if (w.state === 'submerging') scale = w.stateT / WORM_SUBMERGE_TIME;
    else { // devouring: fully up, with a slight chewing shiver
      scale = 1;
      const swayPhase = (hash2(w.id, 5) % 1000) / 1000 * Math.PI * 2;
      sway = Math.sin(t * 9 + swayPhase) * 3;
    }
    scale = Math.max(0, Math.min(1, scale));
    paintWorm(ctx, { phase: 'surfaced', t, seed: w.id, scale, sway });
    ctx.restore();

    if (w.hurt > 0) {
      const shown = Math.max(0.15, scale);
      this.hpBar(sx - WORM_RADIUS * shown, sy - WORM_RADIUS * shown - 10, WORM_RADIUS * 2 * shown,
        Math.min(1, w.hurt / WORM_REPEL_DAMAGE), '#e0a03c');
    }
  }

  // ---- vehicle dust trails + harvester mining plume ------------------------------------------

  /** Spawn dust/plume puffs for a moving ground vehicle or a mining harvester into the fixed
   *  pool (rendering happens separately in drawDustParticles). Renderer-side only: reads sim
   *  state, writes nothing back to it. Called once per unit per frame alongside drawUnit. */
  private trackVehicleDust(u: Unit, world: World, cam: Camera): void {
    // On-screen (with a margin) and fog-visible only: the pool is shared map-wide, so off-screen
    // spawners would evict the puffs the player can actually see.
    if (u.x < cam.x - 48 || u.x > cam.x + cam.viewW + 48
        || u.y < cam.y - 48 || u.y > cam.y + cam.viewH + 48) return;
    if (!this.visibleEntity(world, u.owner, u.x, u.y)) return;
    const t = world.time;
    let track = this.unitTrack.get(u.id);
    if (!track) {
      track = { x: u.x, y: u.y, lastDust: -Infinity, lastPlume: -Infinity };
      this.unitTrack.set(u.id, track);
    }
    const moved = Math.hypot(u.x - track.x, u.y - track.y) > 0.05;

    if (u.def.kind === 'vehicle' && !u.def.flying && moved && t - track.lastDust >= 0.08) {
      const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE);
      if (world.map.inBounds(tx, ty)) {
        const terrain = world.map.terrain[world.map.idx(tx, ty)];
        if (terrain === Terrain.Sand || terrain === Terrain.Spice) {
          const bx = u.x - Math.cos(u.facing) * u.def.radius * 0.8;
          const by = u.y - Math.sin(u.facing) * u.def.radius * 0.8;
          const kind: DustKind = terrain === Terrain.Spice ? 'spiceDust' : 'dust';
          this.dust.spawn(bx, by, t, u.def.radius * 0.8, kind, 0.6);
          track.lastDust = t;
        }
      }
    }

    if (u.def.harvester && u.order.kind === 'harvest' && u.harvestPhase === 'mining'
        && t - track.lastPlume >= 0.12) {
      this.dust.spawn(u.x, u.y - u.def.radius * 0.5, t, u.def.radius * 0.7, 'plume', 0.7);
      track.lastPlume = t;
    }

    track.x = u.x; track.y = u.y;
  }

  /** Drop stale tracked units (dead/removed) occasionally rather than every frame. */
  private pruneVehicleDust(world: World): void {
    const t = world.time;
    if (t - this.lastPruneAt < 3 || this.unitTrack.size === 0) return;
    this.lastPruneAt = t;
    const live = new Set<number>();
    for (const u of world.units) live.add(u.id);
    for (const id of this.unitTrack.keys()) if (!live.has(id)) this.unitTrack.delete(id);
  }

  /** Render every live dust/plume puff from the fixed pool: grows + fades over its own lifetime;
   *  the mining plume additionally drifts upward. No fog gate — puffs are sub-second and only
   *  ever spawned from an already-visible unit, so they age out long before fog would matter. */
  private drawDustParticles(cam: Camera, now: number): void {
    const ctx = this.ctx;
    for (const p of this.dust.particles) {
      const age = now - p.born;
      if (age < 0 || age >= p.life) continue;
      const k = age / p.life;
      const rise = p.kind === 'plume' ? k * 16 : 0;
      const sx = p.x - cam.x, sy = p.y - cam.y - rise;
      if (sx < -24 || sx > cam.viewW + 24 || sy < -24 || sy > cam.viewH + 24) continue;
      const r = Math.max(0.5, p.size * (0.4 + 0.9 * k));
      const alpha = 0.4 * (1 - k);
      ctx.fillStyle = p.kind === 'dust' ? `rgba(196,168,120,${alpha})`
        : p.kind === 'spiceDust' ? `rgba(224,140,50,${alpha})`
        : `rgba(230,150,60,${alpha})`; // plume
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawAimBanner(cam: Camera): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(224,82,74,0.85)';
    ctx.fillRect(cam.viewW / 2 - 165, 32, 330, 22);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ATTACK-MOVE — click target  (Esc/right-click cancels)', cam.viewW / 2, 47);
    ctx.textAlign = 'left';
  }

  private drawTerrain(world: World, cam: Camera): void {
    const ctx = this.ctx;
    const map = world.map;
    const fog = world.fog;
    const tx0 = Math.max(0, Math.floor(cam.x / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE));
    const tx1 = Math.min(map.w - 1, Math.floor((cam.x + cam.viewW) / TILE));
    const ty1 = Math.min(map.h - 1, Math.floor((cam.y + cam.viewH) / TILE));

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const sx = Math.floor(tx * TILE - cam.x);
        const sy = Math.floor(ty * TILE - cam.y);
        if (!fog.explored(tx, ty)) {
          ctx.fillStyle = '#000';
          ctx.fillRect(sx, sy, TILE, TILE);
          continue;
        }
        const i = map.idx(tx, ty);
        const t = map.terrain[i];
        paintTerrainTile(ctx, t, tx, ty, map.spice[i], sx, sy, TILE, {
          n: ty > 0 ? map.terrain[map.idx(tx, ty - 1)] : t,
          s: ty < map.h - 1 ? map.terrain[map.idx(tx, ty + 1)] : t,
          w: tx > 0 ? map.terrain[map.idx(tx - 1, ty)] : t,
          e: tx < map.w - 1 ? map.terrain[map.idx(tx + 1, ty)] : t,
        });
      }
    }
  }

  // Dim explored-but-not-visible tiles after entities are drawn (keeps memory of buildings).
  private drawFogDim(world: World, cam: Camera): void {
    if (!world.config.fog) return;
    const ctx = this.ctx;
    const map = world.map;
    const fog = world.fog;
    const tx0 = Math.max(0, Math.floor(cam.x / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE));
    const tx1 = Math.min(map.w - 1, Math.floor((cam.x + cam.viewW) / TILE));
    const ty1 = Math.min(map.h - 1, Math.floor((cam.y + cam.viewH) / TILE));
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (fog.explored(tx, ty) && !fog.visible(tx, ty)) {
          ctx.fillRect(Math.floor(tx * TILE - cam.x), Math.floor(ty * TILE - cam.y), TILE, TILE);
        }
      }
    }
  }

  private visibleEntity(world: World, owner: string, cx: number, cy: number): boolean {
    if (!world.config.fog || owner === this.localFaction) return true;
    return world.fog.visible(Math.floor(cx / TILE), Math.floor(cy / TILE));
  }

  private drawBuilding(b: Building, world: World, cam: Camera, view: ViewState): void {
    if (!this.visibleEntity(world, b.owner, b.centerX, b.centerY)) return;
    const ctx = this.ctx;
    const sx = b.tx * TILE - cam.x;
    const sy = b.ty * TILE - cam.y;
    const w = b.def.w * TILE, h = b.def.h * TILE;

    const sprite = buildingSprites[b.def.id];
    const hasSprite = !!sprite && sprite.complete && sprite.naturalWidth > 0;
    if (hasSprite) {
      ctx.drawImage(sprite, sx, sy, w, h);
    } else {
      ctx.fillStyle = b.def.color;
      ctx.fillRect(sx, sy, w, h);
      ctx.fillStyle = b.def.trim;
      ctx.fillRect(sx + 3, sy + 3, w - 6, h - 6);
    }
    // owner edge
    ctx.strokeStyle = b.owner === this.localFaction ? PLAYER : ENEMY;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, w - 2, h - 2);

    const bFlash = Math.max(0, (b.hitFlash - world.time) / HIT_FLASH_TIME);
    if (bFlash > 0) { // white "took a hit" flash over the footprint
      ctx.fillStyle = `rgba(255,255,255,${0.55 * bFlash})`;
      ctx.fillRect(sx, sy, w, h);
    }

    if (b.def.weapon) { // turret barrel
      ctx.fillStyle = '#2a2a30';
      ctx.beginPath();
      ctx.arc(sx + w / 2, sy + h / 2, Math.min(w, h) * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    // Name tag — a small pill centred just above the building (kept off the sprite art so it
    // reads cleanly), faction-tinted border. Shown for every visible building.
    ctx.font = 'bold 8px monospace';
    const label = b.def.name;
    const tagW = Math.ceil(ctx.measureText(label).width) + 8, tagH = 11;
    const tagX = Math.round(sx + w / 2 - tagW / 2);
    const tagY = sy - tagH - 6;
    ctx.fillStyle = 'rgba(8,10,14,0.72)';
    ctx.fillRect(tagX, tagY, tagW, tagH);
    ctx.strokeStyle = b.owner === this.localFaction ? 'rgba(70,212,110,0.55)' : 'rgba(224,82,74,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tagX + 0.5, tagY + 0.5, tagW - 1, tagH - 1);
    ctx.fillStyle = '#e8edf2';
    ctx.textAlign = 'center';
    ctx.fillText(label, sx + w / 2, tagY + 8);
    ctx.textAlign = 'left';

    if (view.selectedBuilding === b) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 1, sy - 1, w + 2, h + 2);
    }
    if (b.hp < b.maxHp) this.hpBar(sx, sy - 5, w, b.hp / b.maxHp);
    if (b.repairing) { // pulsing green "+" while self-repair is active
      const pulse = 0.5 + 0.5 * Math.sin(world.time * 6);
      ctx.strokeStyle = `rgba(120,230,150,${pulse})`;
      ctx.lineWidth = 2;
      const ix = sx + w - 6, iy = sy - 9;
      ctx.beginPath();
      ctx.moveTo(ix - 3, iy); ctx.lineTo(ix + 3, iy);
      ctx.moveTo(ix, iy - 3); ctx.lineTo(ix, iy + 3);
      ctx.stroke();
    }
    if (b.muzzleFlash > 0) {
      ctx.fillStyle = 'rgba(255,220,120,0.8)';
      ctx.beginPath();
      ctx.arc(sx + w / 2, sy + h / 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawUnit(u: Unit, world: World, cam: Camera, view: ViewState): void {
    if (!this.visibleEntity(world, u.owner, u.x, u.y)) return;
    const ctx = this.ctx;
    const sx = u.x - cam.x;
    const sy = u.y - cam.y;
    const r = u.def.radius;
    const edge = ownerAccent(u.owner, this.localFaction);
    const house = world.player_(u.owner).house;
    const body = ownerBodyFill(u.owner, house);

    // Drop shadow, drawn before the body: grounded units get a tight offset ellipse; the
    // ornithopter's shadow sits further away and lighter, reading as altitude above the ground.
    if (u.def.flying) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(sx + 10, sy + 14, r * 0.8, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(sx + 3, sy + 4, r * 0.9, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (view.selected.has(u.id)) {
      ctx.strokeStyle = PLAYER;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(u.facing);
    paintUnitBody(ctx, unitShape(u.def.id), r, body, edge, {
      loadFrac: u.def.harvester ? u.load / HARVESTER_CAPACITY : 0,
      muzzle: u.muzzleFlash > 0,
    });
    ctx.restore();

    const flash = Math.max(0, (u.hitFlash - world.time) / HIT_FLASH_TIME);
    if (flash > 0) { // white "took a hit" flash over the silhouette
      ctx.fillStyle = `rgba(255,255,255,${0.8 * flash})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // owner pip (kept as a bright local/enemy cue on top of the house-painted body)
    ctx.fillStyle = edge;
    ctx.fillRect(sx - 2, sy - r - 5, 4, 3);

    if (u.hp < u.maxHp) this.hpBar(sx - r, sy - r - 5, r * 2, u.hp / u.maxHp);

    // Veterancy chevrons: one small gold 'v' per rank, stacked just above the HP-bar line.
    // Cosmetic — reads only the derived rank (no sim mutation); fog gating handled by the
    // visibleEntity early-return at the top of drawUnit.
    if (u.rank > 0) this.rankChevrons(sx, sy - r - 8, u.rank);
  }

  /** Draw `rank` small gold chevrons stacked upward from (cx, y) — a veterancy rank badge. */
  private rankChevrons(cx: number, y: number, rank: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 1.5;
    const half = 3, step = 3; // chevron half-width and vertical spacing
    for (let i = 0; i < rank; i++) {
      const cy = y - i * step;
      ctx.beginPath();
      ctx.moveTo(cx - half, cy - 2);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + half, cy - 2);
      ctx.stroke();
    }
  }

  /** `color`, when given, overrides the usual green/yellow/red HP tiering (used by the worm
   *  repel bar, which is always orange regardless of fraction). */
  private hpBar(x: number, y: number, w: number, frac: number, color?: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = color ?? (frac > 0.5 ? '#5ad46e' : frac > 0.25 ? '#e0c24a' : '#e0524a');
    ctx.fillRect(x, y, w * Math.max(0, frac), 3);
  }

  private drawProjectile(
    p: { x: number; y: number; tx: number; ty: number; weapon: { color: string; type: string } },
    cam: Camera,
  ): void {
    const ctx = this.ctx;
    if (p.weapon.type === 'rocket') { // smoke trail, opposite the travel direction — no history
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const dirX = dist > 0.001 ? dx / dist : 1, dirY = dist > 0.001 ? dy / dist : 0;
      const puffs = 4;
      for (let i = puffs; i >= 1; i--) {
        const bx = p.x - dirX * i * 6 - cam.x;
        const by = p.y - dirY * i * 6 - cam.y;
        const fade = 1 - i / (puffs + 1);
        ctx.fillStyle = `rgba(150,150,150,${0.35 * fade})`;
        ctx.beginPath();
        ctx.arc(bx, by, Math.max(0.6, 2.6 - i * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = p.weapon.color;
    ctx.beginPath();
    ctx.arc(p.x - cam.x, p.y - cam.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawEffect(e: { x: number; y: number; ttl: number; max: number; size: number; kind?: string }, cam: Camera): void {
    const ctx = this.ctx;
    const p = 1 - e.ttl / e.max;               // 0 at the blast, 1 when it has fully faded
    const cx = e.x - cam.x, cy = e.y - cam.y;
    const big = e.size >= 30;                   // buildings (size 36) vs units (18)

    // Infantry "poof": a soft dust cloud (no fire), distinct from the vehicle/building blast.
    if (e.kind === 'poof') {
      const fade = 1 - p;
      for (let i = 0; i < 4; i++) {
        const ang = i * 1.9 + cx * 0.013;       // deterministic per-blast spread
        const dist = e.size * (0.2 + 0.9 * p);
        const px = cx + Math.cos(ang) * dist;
        const py = cy + Math.sin(ang) * dist - p * 5;
        ctx.fillStyle = `rgba(188,176,150,${0.5 * fade})`;
        ctx.beginPath();
        ctx.arc(px, py, e.size * (0.5 + 0.5 * p), 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // Sandworm 'spray': a burst of sand specks + an expanding sand ring. Tan/ochre, not fire —
    // distinct from the vehicle/building blast below (surfacing/bite/drive-off, not a weapon hit).
    if (e.kind === 'spray') {
      const fade = 1 - p;
      const ix = Math.floor(e.x), iy = Math.floor(e.y);
      const n = 8 + (hash2(ix, iy) % 7); // 8..14 specks, deterministic per-blast
      for (let i = 0; i < n; i++) {
        const h = hash2(ix + i * 13, iy + i * 7);
        const ang = ((h % 1000) / 1000) * Math.PI * 2;
        const dist = e.size * (0.3 + 1.1 * p);
        const px = cx + Math.cos(ang) * dist;
        const py = cy + Math.sin(ang) * dist;
        const r = Math.max(1, e.size * 0.09 * fade);
        ctx.fillStyle = h % 2 === 0 ? `rgba(200,164,92,${0.75 * fade})` : `rgba(168,136,64,${0.75 * fade})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(216,180,110,${0.5 * fade})`;
      ctx.lineWidth = Math.max(1, e.size * 0.1 * fade);
      ctx.beginPath();
      ctx.arc(cx, cy, e.size * (0.3 + 1.0 * p), 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    // Sprite-sheet path: play the horizontal strip of square frames across the effect's life.
    const sheet = (big && fxReady('explosion-large')) || fxReady('explosion');
    if (sheet) {
      const fs = sheet.naturalHeight;
      const frames = Math.max(1, Math.round(sheet.naturalWidth / fs));
      const frame = Math.min(frames - 1, Math.floor(p * frames));
      const draw = e.size * 2.6;
      ctx.drawImage(sheet, frame * fs, 0, fs, fs, cx - draw / 2, cy - draw / 2, draw, draw);
      return;
    }

    // Procedural fallback: shockwave ring + fireball core + a hot flash, plus debris for buildings.
    const fade = 1 - p;
    ctx.strokeStyle = `rgba(255,180,80,${0.5 * fade})`;
    ctx.lineWidth = Math.max(1, e.size * 0.16 * fade);
    ctx.beginPath();
    ctx.arc(cx, cy, e.size * (0.4 + 1.3 * p), 0, Math.PI * 2);
    ctx.stroke();

    const core = Math.max(1, e.size * (1 - 0.5 * p));
    ctx.fillStyle = `rgba(255,${Math.max(40, Math.floor(210 - 150 * p))},${Math.max(20, Math.floor(120 - 100 * p))},${0.9 * fade})`;
    ctx.beginPath();
    ctx.arc(cx, cy, core, 0, Math.PI * 2);
    ctx.fill();

    if (p < 0.4) {                              // bright white-hot flash in the first instants
      ctx.fillStyle = `rgba(255,245,200,${0.9 * (1 - p / 0.4)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, e.size * 0.5 * (1 - p), 0, Math.PI * 2);
      ctx.fill();
    }

    if (big) {                                  // debris flung outward (deterministic per blast)
      const s = Math.max(1, e.size * 0.12 * fade);
      for (let i = 0; i < 7; i++) {
        const ang = i * 2.39996 + cx * 0.01 + cy * 0.013; // golden angle, seeded by position
        const dist = e.size * (0.6 + 2.0 * p);
        const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - p * e.size * 0.4;
        ctx.fillStyle = `rgba(60,50,40,${0.8 * fade})`;
        ctx.fillRect(cx + dx - s / 2, cy + dy - s / 2, s, s);
      }
    }
  }

  // Floating damage numbers — rise + fade, fog-gated, culled off-screen. Cosmetic only.
  private drawPopups(world: World, cam: Camera): void {
    if (world.popups.length === 0) return;
    const ctx = this.ctx;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 2;
    for (const pp of world.popups) {
      if (world.config.fog && !world.fog.visible(Math.floor(pp.x / TILE), Math.floor(pp.y / TILE))) continue;
      const t = 1 - pp.ttl / pp.max;            // 0 at spawn → 1 at expiry
      const x = pp.x - cam.x;
      const y = pp.y - cam.y - t * POPUP_RISE;
      if (x < -20 || x > cam.viewW + 20 || y < -10 || y > cam.viewH + 10) continue;
      ctx.globalAlpha = pp.ttl > pp.max * 0.35 ? 1 : Math.max(0, pp.ttl / (pp.max * 0.35));
      const label = String(pp.amount);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(label, x, y);
      ctx.fillStyle = pp.friendly ? '#ff9a8a' : '#ffe6a0';
      ctx.fillText(label, x, y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  /** Destination marker + a thin path tick for selected units that currently have an order. */
  private drawOrderMarkers(world: World, cam: Camera, view: ViewState): void {
    if (view.selected.size === 0) return;
    const ctx = this.ctx;
    for (const id of view.selected) {
      const u = world.findUnit(id);
      if (!u || !u.alive) continue;
      if (!this.visibleEntity(world, u.owner, u.x, u.y)) continue;

      // Escort orders have no gx/gy at all (see Order — 'follow' carries only targetId), so this
      // is handled entirely separately from orderDest's move/attack/harvest destination lookup.
      if (u.order.kind === 'follow') {
        this.drawFollowMarker(u, world, cam);
        continue;
      }

      const dest = this.orderDest(u, world);
      if (!dest) continue;
      const fromX = u.x - cam.x, fromY = u.y - cam.y;
      const toX = dest.x - cam.x, toY = dest.y - cam.y;

      ctx.strokeStyle = 'rgba(70,212,110,0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
      ctx.setLineDash([]);

      if (u.path.length > 1) {
        ctx.fillStyle = 'rgba(70,212,110,0.55)';
        const step = Math.max(1, Math.ceil(u.path.length / 6));
        for (let i = 0; i < u.path.length; i += step) {
          const p = u.path[i];
          ctx.fillRect((p.tx + 0.5) * TILE - cam.x - 1.5, (p.ty + 0.5) * TILE - cam.y - 1.5, 3, 3);
        }
      }

      ctx.strokeStyle = PLAYER;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(toX - 4, toY);
      ctx.lineTo(toX + 4, toY);
      ctx.moveTo(toX, toY - 4);
      ctx.lineTo(toX, toY + 4);
      ctx.stroke();
    }
  }

  /** Follow/escort marker: a short dashed line to the followed unit ending in a small ring,
   *  instead of the usual destination X (there is no fixed destination to mark). No-op if the
   *  followed unit is gone or dead. */
  private drawFollowMarker(u: Unit, world: World, cam: Camera): void {
    const leader = world.findUnit(u.order.targetId!);
    if (!leader || !leader.alive) return;
    const ctx = this.ctx;
    const fromX = u.x - cam.x, fromY = u.y - cam.y;
    const toX = leader.x - cam.x, toY = leader.y - cam.y;

    ctx.strokeStyle = 'rgba(70,212,110,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = PLAYER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(toX, toY, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  private orderDest(u: Unit, world: World): { x: number; y: number } | null {
    const o = u.order;
    if ((o.kind === 'move' || o.kind === 'attackMove') && o.gx !== undefined && o.gy !== undefined) {
      return { x: o.gx, y: o.gy };
    }
    if (o.kind === 'attack' && o.targetId !== undefined) {
      if (o.targetKind === 'building') {
        const b = world.findBuilding(o.targetId);
        if (b) return { x: b.centerX, y: b.centerY };
      } else {
        const t = world.findUnit(o.targetId);
        if (t && t.alive) return { x: t.x, y: t.y };
      }
    }
    if (o.kind === 'harvest') {
      if ((u.harvestPhase === 'toRefinery' || u.harvestPhase === 'unloading') && u.path.length) {
        const p = u.path[u.path.length - 1];
        return { x: (p.tx + 0.5) * TILE, y: (p.ty + 0.5) * TILE };
      }
      if (u.spiceTile) {
        return { x: (u.spiceTile.tx + 0.5) * TILE, y: (u.spiceTile.ty + 0.5) * TILE };
      }
    }
    if (u.path.length) {
      const p = u.path[u.path.length - 1];
      return { x: (p.tx + 0.5) * TILE, y: (p.ty + 0.5) * TILE };
    }
    return null;
  }

  private drawRally(b: Building, cam: Camera): void {
    if (b.rallyX === null || b.rallyY === null) return;
    const ctx = this.ctx;
    const fromX = b.exitX - cam.x, fromY = b.exitY - cam.y;
    const toX = b.rallyX - cam.x, toY = b.rallyY - cam.y;

    // faint line from building exit to the rally point
    ctx.strokeStyle = 'rgba(70,212,110,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.setLineDash([]);

    // small flag at the rally
    ctx.strokeStyle = '#2a2010';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX, toY - 14);
    ctx.stroke();
    ctx.fillStyle = PLAYER;
    ctx.beginPath();
    ctx.moveTo(toX, toY - 14);
    ctx.lineTo(toX + 10, toY - 11);
    ctx.lineTo(toX, toY - 8);
    ctx.closePath();
    ctx.fill();
  }

  private drawGhost(g: { def: BuildingDef; tx: number; ty: number; valid: boolean }, cam: Camera): void {
    const ctx = this.ctx;
    const sx = g.tx * TILE - cam.x;
    const sy = g.ty * TILE - cam.y;
    ctx.fillStyle = g.valid ? 'rgba(80,220,110,0.35)' : 'rgba(220,80,70,0.35)';
    ctx.fillRect(sx, sy, g.def.w * TILE, g.def.h * TILE);
    ctx.strokeStyle = g.valid ? PLAYER : ENEMY;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, g.def.w * TILE, g.def.h * TILE);
  }

  private drawDrag(d: { x0: number; y0: number; x1: number; y1: number }): void {
    const ctx = this.ctx;
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    ctx.strokeStyle = PLAYER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(70,212,110,0.12)';
    ctx.fillRect(x, y, w, h);
  }
}
