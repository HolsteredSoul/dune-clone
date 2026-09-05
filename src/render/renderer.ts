// Draws the world: terrain (culled + fogged), buildings, units, projectiles, explosions, the
// placement ghost, and the selection drag box. UI chrome (sidebar/HUD/minimap) lives in ui.ts.

import type { Camera } from '../core/camera';
import type { World } from '../world/world';
import type { Building } from '../world/building';
import type { Unit } from '../world/unit';
import { TILE, HIT_FLASH_TIME, POPUP_RISE, HARVESTER_CAPACITY } from '../world/constants';
import type { BuildingDef, Faction } from '../world/defs';
import {
  PLAYER_COLOR, ENEMY_COLOR, ownerAccent, ownerBodyFill, paintTerrainTile, paintUnitBody, unitShape,
} from './visuals';

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

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(world: World, cam: Camera, view: ViewState, localFaction: Faction = 'player'): void {
    this.localFaction = localFaction;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cam.viewW, cam.viewH);
    ctx.clip();

    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);

    this.drawTerrain(world, cam);
    for (const b of world.buildings) this.drawBuilding(b, world, cam, view);
    for (const u of world.units) this.drawUnit(u, world, cam, view);
    this.drawOrderMarkers(world, cam, view);
    if (view.selectedBuilding) this.drawRally(view.selectedBuilding, cam);
    for (const p of world.projectiles) this.drawProjectile(p, cam);
    for (const e of world.effects) this.drawEffect(e, cam);
    if (view.placing) this.drawGhost(view.placing, cam);
    this.drawFogDim(world, cam);
    this.drawPopups(world, cam);
    if (view.dragRect) this.drawDrag(view.dragRect);
    if (view.aimAttackMove) this.drawAimBanner(cam);

    ctx.restore();
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

    if (u.def.flying) { // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 10, r, r * 0.5, 0, 0, Math.PI * 2);
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

  private hpBar(x: number, y: number, w: number, frac: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = frac > 0.5 ? '#5ad46e' : frac > 0.25 ? '#e0c24a' : '#e0524a';
    ctx.fillRect(x, y, w * Math.max(0, frac), 3);
  }

  private drawProjectile(p: { x: number; y: number; weapon: { color: string } }, cam: Camera): void {
    const ctx = this.ctx;
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
