// Sandworms — neutral hazards that hunt vibration on open sand (Dune's signature threat).
//
// Deterministic and part of the sim: the ONLY entropy is a mulberry32 stream owned by the
// WormSystem and serialized with the world, so saves, lockstep peers and the headless sim all
// replay the same worm. Rock (incl. rocked building footprints) is impassable, so units parked on
// rock are safe; flyers are ignored. Counter-play: escort guns and turrets auto-fire at a surfaced
// worm (a unit that already fired at a real enemy this tick has cooldown > 0 and is skipped, so
// enemies keep priority); soaking WORM_REPEL_DAMAGE drives it back under — during the surfacing
// window that even cancels the bite.
//
// Lifecycle: roaming → hunting → surfacing → (bite) → devouring → submerging → roaming, with a
// `calm` timer (sated / missed / driven off) gating the next hunt. Plain data + a small system
// class, matching the rest of the codebase.

import {
  TILE, MAP_W, MAP_H,
  WORM_ROAM_SPEED, WORM_HUNT_SPEED, WORM_SENSE_TILES, WORM_THINK, WORM_HUNT_TIMEOUT,
  WORM_STRIKE_DIST, WORM_MAW_RADIUS, WORM_SURFACE_TIME, WORM_DEVOUR_TIME, WORM_SUBMERGE_TIME,
  WORM_SATED_TIME, WORM_MISS_TIME, WORM_FLEE_TIME, WORM_REPEL_DAMAGE, WORM_ROAM_TILES,
  WORM_SPAWN_CLEAR, WORM_RADIUS,
} from './constants';
import { Terrain } from './tilemap';
import { damageMultiplier } from './defs';
import { Projectile } from './projectile';
import type { Faction, WeaponDef } from './defs';
import type { TileMap } from './tilemap';
import type { Unit } from './unit';
import type { Building } from './building';
import type { Effect } from './world';

export type WormState = 'roaming' | 'hunting' | 'surfacing' | 'devouring' | 'submerging';

export interface Worm {
  id: number;
  x: number;            // head position, world px (under the sand unless surfaced)
  y: number;
  facing: number;       // radians of travel (drives the wormsign trail + maw orientation)
  state: WormState;
  stateT: number;       // seconds left in a timed state (hunt timeout / surfacing / devouring / submerging)
  calm: number;         // seconds until it hunts again (sated after a meal / missed / driven off)
  goalX: number;        // current destination (a roam point, or the prey's last position)
  goalY: number;
  targetId: number;     // hunted unit id (0 = none)
  think: number;        // seconds until the next prey re-evaluation
  hurt: number;         // damage absorbed this surfacing; ≥ WORM_REPEL_DAMAGE drives it under
  eaten: number;        // lifetime meals (flavour / stats)
}

export interface WormSnapshot { rng: number; nextId: number; worms: Worm[] }

/** Is the worm currently above the sand (visible body, shootable)? */
export function wormSurfaced(w: Worm): boolean {
  return w.state === 'surfacing' || w.state === 'devouring' || w.state === 'submerging';
}

/** The slice of World the worm system reads and pokes — kept narrow so worm.ts never depends on
 *  World's private internals. */
export interface WormHost {
  readonly units: Unit[];
  readonly buildings: Building[];
  readonly map: TileMap;
  readonly blocked: Uint8Array;
  readonly projectiles: Projectile[];
  readonly effects: Effect[];
  /** Presentation-only viewer faction (never sim state) — used ONLY to decide whether the
   *  browser-only "wormsign" audio cue is queued. */
  readonly localFaction: Faction;
  rangeMult(owner: Faction): number;
  emit(name: string, x?: number, y?: number): void;
  /** Kill a unit the worm bit (World handles the death effect + the viewer's alert). */
  devour(u: Unit, worm: Worm): void;
}

// Vibration each unit class radiates: harvesters are the classic victim, vehicles rumble,
// infantry barely register. Stationary units count for a fraction (a mining harvester is NOT
// stationary — the drill is the loudest thing on Arrakis).
const ATTRACT_HARVESTER = 3;
const ATTRACT_VEHICLE = 2;
const ATTRACT_INFANTRY = 0.6;
const STILL_FACTOR = 0.3;
const PREY_THRESHOLD = 0.25;

export class WormSystem {
  readonly worms: Worm[] = [];
  private rng: number;
  private nextId = 1;

  constructor(seed: number) {
    this.rng = (seed >>> 0) || 1;
  }

  // mulberry32 — the same generator the enemy AI uses; state is serialized with the world.
  private rand(): number {
    let t = (this.rng = (this.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  serialize(): WormSnapshot {
    return { rng: this.rng, nextId: this.nextId, worms: this.worms.map((w) => ({ ...w })) };
  }

  deserialize(s: WormSnapshot): void {
    this.rng = (s.rng >>> 0) || 1;
    this.nextId = s.nextId;
    this.worms.length = 0;
    for (const w of s.worms) this.worms.push({ ...w });
  }

  /** Seed `count` worms on open sand well away from every building (call once the mission's
   *  buildings exist). Each starts calm so the opening minutes are a grace period. */
  spawn(host: WormHost, count: number): void {
    this.worms.length = 0;
    const clear2 = (WORM_SPAWN_CLEAR * TILE) ** 2;
    for (let n = 0; n < count; n++) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const x = (2 + Math.floor(this.rand() * (MAP_W - 4)) + 0.5) * TILE;
        const y = (2 + Math.floor(this.rand() * (MAP_H - 4)) + 0.5) * TILE;
        if (!this.passable(host, x, y)) continue;
        let near = false;
        for (const b of host.buildings) {
          if ((b.centerX - x) ** 2 + (b.centerY - y) ** 2 < clear2) { near = true; break; }
        }
        if (near) continue;
        this.worms.push({
          id: this.nextId++, x, y, facing: this.rand() * Math.PI * 2,
          state: 'roaming', stateT: 0, calm: 35 + this.rand() * 20,
          goalX: x, goalY: y, targetId: 0, think: 0, hurt: 0, eaten: 0,
        });
        break;
      }
    }
  }

  update(host: WormHost, dt: number): void {
    for (const w of this.worms) {
      // A building placed over the head would trap it (sub-pixel steps can't leave a blocked
      // tile), so relocate to the nearest open sand first.
      if (!this.passable(host, w.x, w.y)) this.unstick(host, w);
      switch (w.state) {
        case 'roaming':
          this.roam(host, w, dt);
          break;
        case 'hunting':
          this.hunt(host, w, dt);
          break;
        case 'surfacing':
          this.guns(host, w);
          if (w.hurt >= WORM_REPEL_DAMAGE) { this.driveOff(host, w); break; }
          w.stateT -= dt;
          if (w.stateT <= 0) this.bite(host, w);
          break;
        case 'devouring':
          this.guns(host, w);
          if (w.hurt >= WORM_REPEL_DAMAGE) { this.driveOff(host, w); break; }
          w.stateT -= dt;
          if (w.stateT <= 0) this.submerge(w, WORM_SATED_TIME);
          break;
        case 'submerging':
          // No gunfire while it sinks: it is already leaving, and the shots would only burn
          // cooldowns that a real enemy may need next tick.
          w.stateT -= dt;
          if (w.stateT <= 0) {
            w.state = 'roaming';
            w.hurt = 0;
            this.newRoamGoal(host, w);
          }
          break;
      }
    }
  }

  // ---- underground ---------------------------------------------------------------------------

  private roam(host: WormHost, w: Worm, dt: number): void {
    w.calm -= dt;
    w.think -= dt;
    if (w.calm <= 0 && w.think <= 0) {
      w.think = WORM_THINK;
      const prey = this.pickPrey(host, w);
      if (prey) { this.startHunt(host, w, prey); return; }
    }
    if (this.advance(host, w, WORM_ROAM_SPEED, dt)) this.newRoamGoal(host, w);
  }

  private startHunt(host: WormHost, w: Worm, prey: Unit): void {
    w.state = 'hunting';
    w.stateT = WORM_HUNT_TIMEOUT;
    w.targetId = prey.id;
    w.goalX = prey.x; w.goalY = prey.y;
    w.think = WORM_THINK;
    this.wormsign(host, w, prey);
  }

  /** Wormsign warning for the viewer whose unit is being stalked. Presentation only: the cue
   *  queue is browser-only and never part of the sim state. */
  private wormsign(host: WormHost, w: Worm, prey: Unit): void {
    if (prey.owner === host.localFaction) host.emit('worm-sign', w.x, w.y);
  }

  private hunt(host: WormHost, w: Worm, dt: number): void {
    w.think -= dt;
    w.stateT -= dt;
    if (w.stateT <= 0) { this.giveUp(host, w, 5); return; }
    let prey = this.findUnit(host, w.targetId);
    if (w.think <= 0 || !prey || !this.huntable(host, prey)) {
      w.think = WORM_THINK;
      const next = this.pickPrey(host, w);
      if (!next) { this.giveUp(host, w, 2); return; }
      if (next.id !== w.targetId) { w.targetId = next.id; this.wormsign(host, w, next); }
      prey = next;
    }
    w.goalX = prey.x; w.goalY = prey.y;
    if ((prey.x - w.x) ** 2 + (prey.y - w.y) ** 2 <= WORM_STRIKE_DIST * WORM_STRIKE_DIST) {
      this.surface(host, w);
      return;
    }
    // advance() only reports "done" mid-hunt when the worm is boxed in by rock.
    if (this.advance(host, w, WORM_HUNT_SPEED, dt)) this.giveUp(host, w, 3);
  }

  private giveUp(host: WormHost, w: Worm, calm: number): void {
    w.state = 'roaming';
    w.targetId = 0;
    w.calm = calm;
    this.newRoamGoal(host, w);
  }

  // ---- surfaced ------------------------------------------------------------------------------

  private surface(host: WormHost, w: Worm): void {
    w.state = 'surfacing';
    w.stateT = WORM_SURFACE_TIME;
    w.hurt = 0;
    host.effects.push({ x: w.x, y: w.y, ttl: 0.9, max: 0.9, size: 44, kind: 'spray' });
    host.emit('worm-surface', w.x, w.y);
  }

  private bite(host: WormHost, w: Worm): void {
    let meals = 0;
    const r2 = WORM_MAW_RADIUS * WORM_MAW_RADIUS;
    for (const u of host.units) {
      if (!u.alive || u.def.flying) continue;
      if ((u.x - w.x) ** 2 + (u.y - w.y) ** 2 > r2) continue;
      if (!this.onSand(host, u.x, u.y)) continue;
      host.devour(u, w);
      meals++;
    }
    w.targetId = 0;
    if (meals > 0) {
      w.eaten += meals;
      w.state = 'devouring';
      w.stateT = WORM_DEVOUR_TIME;
      host.effects.push({ x: w.x, y: w.y, ttl: 0.7, max: 0.7, size: 36, kind: 'spray' });
    } else {
      this.submerge(w, WORM_MISS_TIME);
    }
  }

  private submerge(w: Worm, calm: number): void {
    w.state = 'submerging';
    w.stateT = WORM_SUBMERGE_TIME;
    w.calm = calm;
    w.targetId = 0;
  }

  private driveOff(host: WormHost, w: Worm): void {
    host.effects.push({ x: w.x, y: w.y, ttl: 0.6, max: 0.6, size: 30, kind: 'spray' });
    this.submerge(w, WORM_FLEE_TIME);
  }

  /** Nearby guns that did NOT fire at a real enemy this tick (their cooldown already elapsed)
   *  take a shot at the surfaced worm — escorts and turrets are the counter-play. */
  private guns(host: WormHost, w: Worm): void {
    for (const u of host.units) {
      const wp = u.def.weapon;
      if (!wp || !u.alive || u.cooldown > 0 || u.stance === 'holdfire') continue;
      if (u.order.kind === 'attack') continue; // committed to an enemy: don't spend its shot here
      if (!this.inRange(wp, u.x, u.y, w, host.rangeMult(u.owner))) continue;
      u.facing = Math.atan2(w.y - u.y, w.x - u.x);
      u.cooldown = wp.cooldown;
      u.muzzleFlash = 0.08;
      this.shoot(host, u.owner, wp, u.x, u.y, w);
    }
    for (const b of host.buildings) {
      const wp = b.def.weapon;
      if (!wp || !b.alive || b.cooldown > 0) continue;
      if (!this.inRange(wp, b.centerX, b.centerY, w, 1)) continue;
      b.cooldown = wp.cooldown;
      b.muzzleFlash = 0.1;
      this.shoot(host, b.owner, wp, b.centerX, b.centerY, w);
    }
  }

  private inRange(wp: WeaponDef, x: number, y: number, w: Worm, mult: number): boolean {
    const d2 = (w.x - x) ** 2 + (w.y - y) ** 2;
    const max = wp.range * mult + WORM_RADIUS;
    if (d2 > max * max) return false;
    if (wp.minRange && d2 < wp.minRange * wp.minRange) return false;
    return true;
  }

  private shoot(host: WormHost, owner: Faction, wp: WeaponDef, x: number, y: number, w: Worm): void {
    // Hide is heavy armour: cannons/rockets bite, small arms barely scratch.
    w.hurt += wp.damage * damageMultiplier(wp.type, 'heavy');
    host.projectiles.push(new Projectile(owner, wp, x, y, w.x, w.y));
    host.emit(`fire-${wp.type}`, x, y);
  }

  // ---- senses + movement ---------------------------------------------------------------------

  /** Loudest reachable prey within sense range, distance-weighted. Deterministic: units are
   *  scanned in array order and ties keep the first. */
  private pickPrey(host: WormHost, w: Worm): Unit | null {
    const r2 = (WORM_SENSE_TILES * TILE) ** 2;
    let best: Unit | null = null;
    let bestScore = 0;
    for (const u of host.units) {
      if (!this.huntable(host, u)) continue;
      const d2 = (u.x - w.x) ** 2 + (u.y - w.y) ** 2;
      if (d2 > r2) continue;
      const base = u.def.harvester ? ATTRACT_HARVESTER
                 : u.def.kind === 'infantry' ? ATTRACT_INFANTRY : ATTRACT_VEHICLE;
      const active = u.path.length > 0
        || (u.def.harvester && u.order.kind === 'harvest' && u.harvestPhase === 'mining');
      const score = base * (active ? 1 : STILL_FACTOR) / (1 + Math.sqrt(d2) / (6 * TILE));
      if (score > bestScore) { bestScore = score; best = u; }
    }
    return bestScore >= PREY_THRESHOLD ? best : null;
  }

  private huntable(host: WormHost, u: Unit): boolean {
    return u.alive && !u.def.flying && this.onSand(host, u.x, u.y);
  }

  private findUnit(host: WormHost, id: number): Unit | null {
    if (!id) return null;
    for (const u of host.units) if (u.id === id) return u;
    return null;
  }

  /** Sand or spice (not Rock) — where a worm can travel, surface and feed. */
  private onSand(host: WormHost, x: number, y: number): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!host.map.inBounds(tx, ty)) return false;
    return host.map.terrain[host.map.idx(tx, ty)] !== Terrain.Rock;
  }

  /** Sand/spice, unbuilt, and one tile inside the map edge. */
  private passable(host: WormHost, x: number, y: number): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) return false;
    const i = host.map.idx(tx, ty);
    return host.map.terrain[i] !== Terrain.Rock && host.blocked[i] === 0;
  }

  /** Slide toward the goal, deflecting around rock. Returns true when the goal is reached OR the
   *  worm is boxed in (caller picks a new goal). */
  private advance(host: WormHost, w: Worm, speed: number, dt: number): boolean {
    const dx = w.goalX - w.x, dy = w.goalY - w.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return true;
    const step = Math.min(speed * dt, dist);
    const ang = Math.atan2(dy, dx);
    for (const off of DEFLECT) {
      const a = ang + off;
      const nx = w.x + Math.cos(a) * step, ny = w.y + Math.sin(a) * step;
      if (!this.passable(host, nx, ny)) continue;
      w.x = nx; w.y = ny; w.facing = a;
      return dist - step < 4;
    }
    return true;
  }

  /** Move the head to the nearest open sand tile (deterministic ring scan). */
  private unstick(host: WormHost, w: Worm): void {
    const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
    for (let r = 1; r < 16; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = (tx + dx + 0.5) * TILE, y = (ty + dy + 0.5) * TILE;
          if (!this.passable(host, x, y)) continue;
          w.x = x; w.y = y; w.goalX = x; w.goalY = y;
          if (wormSurfaced(w)) this.submerge(w, WORM_MISS_TIME);
          return;
        }
      }
    }
  }

  private newRoamGoal(host: WormHost, w: Worm): void {
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = this.rand() * Math.PI * 2;
      const r = (3 + this.rand() * (WORM_ROAM_TILES - 3)) * TILE;
      const x = w.x + Math.cos(a) * r, y = w.y + Math.sin(a) * r;
      if (this.passable(host, x, y)) { w.goalX = x; w.goalY = y; return; }
    }
    w.goalX = w.x; w.goalY = w.y;
  }
}

// Steering offsets (radians) tried in order when the direct step hits rock.
const DEFLECT = [0, 0.6, -0.6, 1.3, -1.3, 2.0, -2.0, Math.PI];
