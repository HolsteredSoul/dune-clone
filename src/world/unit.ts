// A mobile unit. Holds position, health, order/path state, and low-level movement helpers.
// Higher-level behaviour (target acquisition, harvesting, firing) is driven by world.ts, which
// has the cross-entity context (map, enemies, projectiles) a single unit can't see on its own.

import { TILE, ARRIVE_EPS } from './constants';
import type { UnitDef, Faction, Stance } from './defs';
import type { TileXY } from '../core/astar';

let nextId = 1;

export type OrderKind = 'idle' | 'move' | 'attackMove' | 'attack' | 'hold' | 'harvest';

export type TargetKind = 'unit' | 'building';

export interface Order {
  kind: OrderKind;
  gx?: number;          // world-px goal (move / attackMove)
  gy?: number;
  targetId?: number;    // attack target
  targetKind?: TargetKind;
}

export type HarvestPhase = 'toSpice' | 'mining' | 'toRefinery' | 'unloading';

export class Unit {
  readonly entityKind = 'unit' as const;
  readonly id = nextId++;
  hp: number;
  cooldown = 0;

  order: Order = { kind: 'idle' };
  stance: Stance = 'guard';          // autonomous posture when no explicit order
  guardX: number;                    // post the unit defends / returns to
  guardY: number;
  path: TileXY[] = [];
  pathGoal: TileXY | null = null;   // tile the current path targets

  // harvester sub-state
  load = 0;
  harvestPhase: HarvestPhase = 'toSpice';
  spiceTile: TileXY | null = null;

  // transient per-frame separation push (filled by world, applied in integrate)
  pushX = 0;
  pushY = 0;

  repathTimer = 0; // throttles A* recomputes while chasing
  facing = 0;      // radians, last movement direction (for drawing)
  muzzleFlash = 0; // seconds remaining of firing flash (visual)

  constructor(
    readonly def: UnitDef,
    readonly owner: Faction,
    public x: number,
    public y: number,
  ) {
    this.hp = def.maxHp;
    this.guardX = x;
    this.guardY = y;
  }

  get alive(): boolean { return this.hp > 0; }
  get tileX(): number { return Math.floor(this.x / TILE); }
  get tileY(): number { return Math.floor(this.y / TILE); }

  distanceTo(x: number, y: number): number {
    return Math.hypot(x - this.x, y - this.y);
  }

  /** Advance along the current path. Returns true when the final waypoint is reached. */
  followPath(dt: number): boolean {
    if (this.path.length === 0) return true;
    const wp = this.path[0];
    const wx = (wp.tx + 0.5) * TILE;
    const wy = (wp.ty + 0.5) * TILE;
    if (this.stepToward(wx, wy, dt)) {
      this.path.shift();
      if (this.path.length === 0) { this.pathGoal = null; return true; }
    }
    return false;
  }

  /** Move straight toward a world point. Returns true on arrival. */
  stepToward(x: number, y: number, dt: number): boolean {
    const dx = x - this.x;
    const dy = y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.def.speed * dt;
    if (dist <= step || dist <= ARRIVE_EPS) {
      this.x = x;
      this.y = y;
      return true;
    }
    this.facing = Math.atan2(dy, dx);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    return false;
  }

  clearPath(): void {
    this.path = [];
    this.pathGoal = null;
  }
}
