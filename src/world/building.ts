// A placed structure. Generic over its BuildingDef; turret firing logic lives in the combat
// system (world.ts), this just holds state and geometry.

import { TILE } from './constants';
import type { BuildingDef, Faction } from './defs';

let nextId = 1;

export class Building {
  readonly entityKind = 'building' as const;
  readonly id = nextId++;
  hp: number;
  cooldown = 0; // turret weapon cooldown timer
  muzzleFlash = 0;
  hitFlash = 0; // world.time at which the white "I got hit" flash expires (visual only)
  rallyX: number | null = null; // unit gather point (world px); null = none
  rallyY: number | null = null;

  constructor(
    readonly def: BuildingDef,
    readonly owner: Faction,
    readonly tx: number,
    readonly ty: number,
  ) {
    this.hp = def.maxHp;
  }

  get centerX(): number { return (this.tx + this.def.w / 2) * TILE; }
  get centerY(): number { return (this.ty + this.def.h / 2) * TILE; }

  /** Front-center point used as harvester unload dock / unit exit. */
  get exitX(): number { return this.centerX; }
  get exitY(): number { return (this.ty + this.def.h) * TILE + TILE * 0.5; }

  /** True for buildings that finish units (and can therefore hold a rally point). */
  get isProducer(): boolean {
    const id = this.def.id;
    return id === 'yard' || id === 'barracks' || id === 'factory' || id === 'helipad';
  }

  get alive(): boolean { return this.hp > 0; }

  coversTile(tx: number, ty: number): boolean {
    return tx >= this.tx && tx < this.tx + this.def.w
        && ty >= this.ty && ty < this.ty + this.def.h;
  }
}
