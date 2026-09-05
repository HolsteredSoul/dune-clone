// Renderer-owned, allocation-free particle/decal pools — cosmetic bookkeeping only, never sim
// state (nothing here is serialized or read by src/world/*). Both pools are fixed-size ring
// buffers: spawning always overwrites the oldest slot, so all storage is allocated once here at
// construction and the steady-state per-frame cost is a fixed scan, never a growing array.

export type DustKind = 'dust' | 'spiceDust' | 'plume';

export interface DustParticle {
  x: number;
  y: number;
  born: number;   // world.time at spawn
  size: number;   // base radius (px) the puff grows from
  life: number;   // seconds this particle lives (caller decides — dust vs plume differ slightly)
  kind: DustKind;
}

const DUST_POOL_SIZE = 256;

/** Fixed ring of dust/plume puffs — vehicle dust trails + the harvester mining plume. */
export class DustPool {
  /** Fixed-size; iterate directly and skip slots where `now - born >= life`. */
  readonly particles: DustParticle[] = Array.from({ length: DUST_POOL_SIZE }, () => (
    { x: 0, y: 0, born: -1e9, size: 0, life: 0, kind: 'dust' as DustKind }
  ));
  private cursor = 0;

  spawn(x: number, y: number, born: number, size: number, kind: DustKind, life: number): void {
    const p = this.particles[this.cursor];
    p.x = x; p.y = y; p.born = born; p.size = size; p.kind = kind; p.life = life;
    this.cursor = (this.cursor + 1) % DUST_POOL_SIZE;
  }

  /** Expire every puff (a new World restarts its clock at 0, so old timestamps would linger). */
  reset(): void {
    for (const p of this.particles) p.born = -1e9;
    this.cursor = 0;
  }
}

export interface ScorchDecal {
  x: number;
  y: number;
  r: number;
  born: number; // world.time at spawn
}

const SCORCH_POOL_SIZE = 48;
export const SCORCH_LIFE = 90; // seconds a scorch mark takes to fully fade

/** Fixed ring of ground scorch marks left by blast-kind effects. */
export class ScorchPool {
  /** Fixed-size; iterate directly and skip slots where `now - born >= SCORCH_LIFE`. */
  readonly decals: ScorchDecal[] = Array.from({ length: SCORCH_POOL_SIZE }, () => (
    { x: 0, y: 0, r: 0, born: -1e9 }
  ));
  private cursor = 0;

  push(x: number, y: number, r: number, born: number): void {
    const d = this.decals[this.cursor];
    d.x = x; d.y = y; d.r = r; d.born = born;
    this.cursor = (this.cursor + 1) % SCORCH_POOL_SIZE;
  }

  /** Expire every decal (see DustPool.reset). */
  reset(): void {
    for (const d of this.decals) d.born = -1e9;
    this.cursor = 0;
  }
}
