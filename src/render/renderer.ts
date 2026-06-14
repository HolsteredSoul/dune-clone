// Draws the world: terrain (culled + fogged), buildings, units, projectiles, explosions, the
// placement ghost, and the selection drag box. UI chrome (sidebar/HUD/minimap) lives in ui.ts.

import type { Camera } from '../core/camera';
import type { World } from '../world/world';
import type { Building } from '../world/building';
import type { Unit } from '../world/unit';
import { Terrain } from '../world/tilemap';
import { TILE } from '../world/constants';
import type { BuildingDef } from '../world/defs';

export interface ViewState {
  selected: Set<number>;
  selectedBuilding: Building | null;
  placing: { def: BuildingDef; tx: number; ty: number; valid: boolean } | null;
  aimAttackMove: boolean;
  dragRect: { x0: number; y0: number; x1: number; y1: number } | null;
}

const PLAYER = '#46d46e';
const ENEMY = '#e0524a';
const C = {
  sand: '#c2a058', sandAlt: '#b89550', rock: '#6b5d44',
  spice: '#d8742a', spiceRich: '#a8481a',
};

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
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(world: World, cam: Camera, view: ViewState): void {
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
    if (view.selectedBuilding) this.drawRally(view.selectedBuilding, cam);
    for (const p of world.projectiles) this.drawProjectile(p, cam);
    for (const e of world.effects) this.drawEffect(e, cam);
    if (view.placing) this.drawGhost(view.placing, cam);
    this.drawFogDim(world, cam);
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
        let color: string;
        if (t === Terrain.Rock) color = C.rock;
        else if (t === Terrain.Spice) color = map.spice[i] > 500 ? C.spiceRich : C.spice;
        else color = (tx + ty) % 2 === 0 ? C.sand : C.sandAlt;
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, TILE, TILE);
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
    if (!world.config.fog || owner === 'player') return true;
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
    ctx.strokeStyle = b.owner === 'player' ? PLAYER : ENEMY;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, w - 2, h - 2);

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
    ctx.strokeStyle = b.owner === 'player' ? 'rgba(70,212,110,0.55)' : 'rgba(224,82,74,0.55)';
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
    if (b.hp < b.def.maxHp) this.hpBar(sx, sy - 5, w, b.hp / b.def.maxHp);
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
    const edge = u.owner === 'player' ? PLAYER : ENEMY;

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
    if (u.def.harvester) {
      ctx.fillStyle = u.def.color;
      ctx.fillRect(-r, -r * 0.8, r * 2, r * 1.6);
      const fill = u.load / 700 * (r * 1.6);
      ctx.fillStyle = u.def.trim;
      ctx.fillRect(-r, r * 0.8 - fill, r * 2, fill);
      ctx.strokeStyle = '#2a2010';
      ctx.lineWidth = 1;
      ctx.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
    } else {
      ctx.rotate(u.facing);
      ctx.fillStyle = u.def.color;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.8, -r * 0.8);
      ctx.lineTo(-r * 0.8, r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = u.def.trim;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (u.muzzleFlash > 0) {
        ctx.fillStyle = 'rgba(255,235,150,0.9)';
        ctx.beginPath();
        ctx.arc(r + 2, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // tiny owner pip
    ctx.fillStyle = edge;
    ctx.fillRect(sx - 1, sy - r - 4, 2, 2);

    if (u.hp < u.maxHp) this.hpBar(sx - r, sy - r - 5, r * 2, u.hp / u.maxHp);
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

  private drawEffect(e: { x: number; y: number; ttl: number; max: number; size: number }, cam: Camera): void {
    const ctx = this.ctx;
    const p = 1 - e.ttl / e.max;               // 0 at the blast, 1 when it has fully faded
    const cx = e.x - cam.x, cy = e.y - cam.y;
    const big = e.size >= 30;                   // buildings (size 36) vs units (16)

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
