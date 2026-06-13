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

    ctx.fillStyle = b.def.color;
    ctx.fillRect(sx, sy, w, h);
    ctx.fillStyle = b.def.trim;
    ctx.fillRect(sx + 3, sy + 3, w - 6, h - 6);
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
    ctx.fillStyle = '#cdd6df';
    ctx.font = '9px monospace';
    ctx.fillText(b.def.name.slice(0, 10), sx + 4, sy + 12);

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

    if (u.hp < u.def.maxHp) this.hpBar(sx - r, sy - r - 5, r * 2, u.hp / u.def.maxHp);
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
    const t = e.ttl / e.max;
    const radius = e.size * (1 - t * 0.5);
    ctx.fillStyle = `rgba(255,${Math.floor(140 + 80 * t)},40,${t * 0.8})`;
    ctx.beginPath();
    ctx.arc(e.x - cam.x, e.y - cam.y, radius, 0, Math.PI * 2);
    ctx.fill();
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
