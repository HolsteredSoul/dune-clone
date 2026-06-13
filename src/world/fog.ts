// Tile-based fog of war for the human player. Each tile is unseen (0), explored (1, dimmed),
// or currently visible (2). Recomputed on an interval from the player's units and buildings.

import { MAP_W, MAP_H, TILE } from './constants';
import type { Unit } from './unit';
import type { Building } from './building';

export class Fog {
  readonly state = new Uint8Array(MAP_W * MAP_H);

  recompute(units: Unit[], buildings: Building[]): void {
    // Currently-visible tiles fall back to merely explored.
    for (let i = 0; i < this.state.length; i++) {
      if (this.state[i] === 2) this.state[i] = 1;
    }
    for (const u of units) this.reveal(u.x / TILE, u.y / TILE, u.def.sight);
    for (const b of buildings) {
      this.reveal(b.tx + b.def.w / 2, b.ty + b.def.h / 2, b.def.sight);
    }
  }

  private reveal(cx: number, cy: number, radius: number): void {
    const r = Math.ceil(radius);
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(MAP_W - 1, Math.ceil(cx + r));
    const y1 = Math.min(MAP_H - 1, Math.ceil(cy + r));
    const r2 = radius * radius;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const dx = tx + 0.5 - cx;
        const dy = ty + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.state[ty * MAP_W + tx] = 2;
      }
    }
  }

  visible(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.state[ty * MAP_W + tx] === 2;
  }

  explored(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.state[ty * MAP_W + tx] >= 1;
  }

  /** Reveal everything (used when fog is disabled for a mission). */
  revealAll(): void {
    this.state.fill(2);
  }
}
