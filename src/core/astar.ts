// Grid A* over a passability array. Returns a list of tile centers (in tile coords) from just
// after the start to the goal, or null if unreachable. 8-directional, no corner cutting.

import { MAP_W, MAP_H } from '../world/constants';

export interface TileXY { tx: number; ty: number; }

// Minimal binary min-heap keyed by f-score, storing tile indices.
class MinHeap {
  private idx: number[] = [];
  private f: number[] = [];

  get size(): number { return this.idx.length; }

  push(index: number, fScore: number): void {
    this.idx.push(index);
    this.f.push(fScore);
    let i = this.idx.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p] <= this.f[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.idx[0];
    const lastIdx = this.idx.pop()!;
    const lastF = this.f.pop()!;
    if (this.idx.length > 0) {
      this.idx[0] = lastIdx;
      this.f[0] = lastF;
      let i = 0;
      const n = this.idx.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < n && this.f[l] < this.f[s]) s = l;
        if (r < n && this.f[r] < this.f[s]) s = r;
        if (s === i) break;
        this.swap(i, s);
        i = s;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const ti = this.idx[a]; this.idx[a] = this.idx[b]; this.idx[b] = ti;
    const tf = this.f[a]; this.f[a] = this.f[b]; this.f[b] = tf;
  }
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** blocked: 1 = impassable, 0 = passable. Pathfind from (sx,sy) to (gx,gy). */
export function findPath(
  blocked: Uint8Array,
  sx: number, sy: number,
  gx: number, gy: number,
): TileXY[] | null {
  if (sx === gx && sy === gy) return [];
  const w = MAP_W, h = MAP_H;
  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  if (!inB(gx, gy)) return null;

  const start = sy * w + sx;
  const goal = gy * w + gx;
  const came = new Int32Array(w * h).fill(-1);
  const gScore = new Float32Array(w * h).fill(Infinity);
  const closed = new Uint8Array(w * h);
  const open = new MinHeap();

  gScore[start] = 0;
  open.push(start, heuristic(sx, sy, gx, gy));

  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goal) return reconstruct(came, cur, w);
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = (cur / w) | 0;

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inB(nx, ny)) continue;
      const ni = ny * w + nx;
      if (blocked[ni] || closed[ni]) continue;
      if (dx !== 0 && dy !== 0) {
        // disallow cutting across a blocked orthogonal corner
        if (blocked[cy * w + nx] || blocked[ny * w + cx]) continue;
      }
      const step = dx !== 0 && dy !== 0 ? 1.41421356 : 1;
      const tentative = gScore[cur] + step;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        came[ni] = cur;
        open.push(ni, tentative + heuristic(nx, ny, gx, gy));
      }
    }
  }
  return null;
}

function heuristic(x: number, y: number, gx: number, gy: number): number {
  const dx = Math.abs(x - gx);
  const dy = Math.abs(y - gy);
  // octile distance
  return (dx + dy) + (1.41421356 - 2) * Math.min(dx, dy);
}

function reconstruct(came: Int32Array, end: number, w: number): TileXY[] {
  const path: TileXY[] = [];
  let cur = end;
  while (cur !== -1) {
    path.push({ tx: cur % w, ty: (cur / w) | 0 });
    cur = came[cur];
  }
  path.reverse();
  path.shift(); // drop the start tile
  return path;
}

/** Find the nearest passable tile to (tx,ty) via expanding ring search. */
export function nearestOpen(blocked: Uint8Array, tx: number, ty: number): TileXY {
  const w = MAP_W, h = MAP_H;
  if (tx >= 0 && ty >= 0 && tx < w && ty < h && !blocked[ty * w + tx]) return { tx, ty };
  for (let r = 1; r < Math.max(w, h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !blocked[ny * w + nx]) {
          return { tx: nx, ty: ny };
        }
      }
    }
  }
  return { tx, ty };
}
