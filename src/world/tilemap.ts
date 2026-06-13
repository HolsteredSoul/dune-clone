// Tile-based terrain. Flat typed arrays for terrain type and remaining spice per tile.

import { MAP_W, MAP_H, SPICE_PER_TILE, TILE } from './constants';

export enum Terrain {
  Sand = 0,
  Rock = 1,
  Spice = 2,
}

export class TileMap {
  readonly w = MAP_W;
  readonly h = MAP_H;
  readonly terrain: Uint8Array;
  readonly spice: Float32Array; // remaining spice in each Spice tile

  constructor(autoSpice = true) {
    this.terrain = new Uint8Array(this.w * this.h);
    this.spice = new Float32Array(this.w * this.h);
    this.generateTerrain();
    if (autoSpice) {
      for (let f = 0; f < 4; f++) {
        const cx = 6 + Math.floor(Math.random() * (this.w - 12));
        const cy = 6 + Math.floor(Math.random() * (this.h - 12));
        this.stampSpice(cx, cy, 3 + Math.floor(Math.random() * 3));
      }
    }
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  private generateTerrain(): void {
    // Mostly sand with scattered rock outcrops.
    for (let i = 0; i < this.terrain.length; i++) {
      this.terrain[i] = Math.random() < 0.07 ? Terrain.Rock : Terrain.Sand;
    }
  }

  /** Stamp a roughly circular spice field centred on (cx,cy), denser toward the middle. */
  stampSpice(cx: number, cy: number, radius: number): void {
    for (let ty = cy - radius; ty <= cy + radius; ty++) {
      for (let tx = cx - radius; tx <= cx + radius; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        const d = Math.hypot(tx - cx, ty - cy);
        if (d <= radius && Math.random() < 1 - d / (radius + 1)) {
          const i = this.idx(tx, ty);
          this.terrain[i] = Terrain.Spice;
          this.spice[i] = SPICE_PER_TILE * (0.5 + Math.random() * 0.5);
        }
      }
    }
  }

  /** Mine up to `amount` spice from a tile. Returns how much was actually mined; the tile
   *  reverts to sand once empty. */
  mineAt(tx: number, ty: number, amount: number): number {
    if (!this.inBounds(tx, ty)) return 0;
    const i = this.idx(tx, ty);
    if (this.terrain[i] !== Terrain.Spice) return 0;
    const got = Math.min(amount, this.spice[i]);
    this.spice[i] -= got;
    if (this.spice[i] <= 0) {
      this.spice[i] = 0;
      this.terrain[i] = Terrain.Sand;
    }
    return got;
  }

  /** Nearest remaining spice tile (by squared tile distance) to a world position. */
  nearestSpice(wx: number, wy: number): { tx: number; ty: number } | null {
    const sx = Math.floor(wx / TILE);
    const sy = Math.floor(wy / TILE);
    let best: { tx: number; ty: number } | null = null;
    let bestD = Infinity;
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        if (this.terrain[this.idx(tx, ty)] !== Terrain.Spice) continue;
        const dx = tx - sx;
        const dy = ty - sy;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { tx, ty }; }
      }
    }
    return best;
  }
}
