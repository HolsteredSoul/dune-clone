// A travelling shot. Moves toward a locked world point; on arrival the combat system applies
// damage (and optional splash) at that point. Instant-feel weapons just use a high speed.

import type { Faction, WeaponDef } from './defs';

let nextId = 1;

export class Projectile {
  readonly id = nextId++;
  alive = true;

  constructor(
    readonly owner: Faction,
    readonly weapon: WeaponDef,
    public x: number,
    public y: number,
    public tx: number,   // target world point
    public ty: number,
  ) {}

  /** Advance toward the target. Returns true on the tick it reaches the target. */
  update(dt: number): boolean {
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.weapon.projectileSpeed * dt;
    if (dist <= step || dist === 0) {
      this.x = this.tx;
      this.y = this.ty;
      this.alive = false;
      return true;
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    return false;
  }
}
