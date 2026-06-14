// The simulation orchestrator: owns the map, both players, all buildings/units/projectiles, and
// runs economy, production, movement, combat, fog, and victory checks each fixed tick. Systems
// that need cross-entity context (targeting, harvesting, pathing) live here rather than on the
// entities themselves.

import {
  TILE, MAP_W, MAP_H, HARVEST_RATE, HARVESTER_CAPACITY, HARVEST_LEASH, UNLOAD_RATE,
  SPICE_PER_CREDIT, MIN_POWER_FACTOR, SEPARATION_RADIUS, SEPARATION_FORCE, CORPSE_TTL,
  FOG_REFRESH, GUARD_LEASH, AGGRO_LEASH, HIT_FLASH_TIME, POPUP_TTL,
} from './constants';
import { TileMap, Terrain } from './tilemap';
import { Building } from './building';
import { Unit } from './unit';
import { Projectile } from './projectile';
import { Player } from './player';
import { Fog } from './fog';
import { BUILDINGS, UNITS, DIFFICULTY, UPGRADES, damageMultiplier } from './defs';
import type { BuildingDef, Faction, Stance, Difficulty, ArmorClass, WeaponDef } from './defs';
import { findPath, nearestOpen } from '../core/astar';

export type Combatant = Unit | Building;

export interface Effect {
  x: number;
  y: number;
  ttl: number;
  max: number;
  size: number;
  kind?: 'blast' | 'poof'; // blast = fiery (vehicles/buildings); poof = dust (infantry). default blast
}

/** A one-shot sound request the controller drains each rendered frame (see Game). Kept as plain
 *  data so the sim stays pure and the headless harness never touches audio. */
export interface AudioEvent {
  name: string;
  x: number;
  y: number;
}

/** A floating damage number (cosmetic). Browser-only — never created in the headless sim. */
export interface Popup {
  x: number;
  y: number;
  amount: number;
  ttl: number;
  max: number;
  friendly: boolean; // damage to a player-owned entity (drawn warning-red) vs an enemy (bright)
}

// True only in a browser. In the headless sim (Node, no `window`) this is false, so the cosmetic
// queues (audioEvents, popups) never accumulate and there is zero overhead — the sim stays pure.
const IN_BROWSER = typeof window !== 'undefined';

export interface MissionConfig {
  name: string;
  brief: string;
  fog: boolean;
  aggression: number;
  aiPersonality?: string; // EnemyAI archetype id (see ai.ts PERSONALITIES); default 'balanced'
  objective?: Objective;  // win condition; default 'destroyAll'
  playerCredits: number;
  enemyCredits: number;
  buildings: { faction: Faction; defId: string; tx: number; ty: number }[];
  units: { faction: Faction; defId: string; tx: number; ty: number }[];
  spiceFields: { tx: number; ty: number; r: number }[];
  cameraStart: { tx: number; ty: number };
}

export type GameResult = 'playing' | 'won' | 'lost';

/** What the player must do to win a mission. Default (unset) = 'destroyAll' (last-base-standing,
 *  the historical behaviour). Losing your whole base is always a loss regardless of kind. */
export interface Objective {
  kind: 'destroyAll' | 'destroyTarget' | 'survive' | 'defend';
  timeLimit?: number;   // seconds — win at this time (survive/defend); also shown as a HUD countdown
  targetDefId?: string; // building id to destroy (destroyTarget) or to protect (defend)
}

export class World {
  readonly map = new TileMap(false); // generate terrain only; spice stamped per mission
  readonly player = new Player('player');
  readonly enemy = new Player('enemy');
  readonly buildings: Building[] = [];
  readonly units: Unit[] = [];
  readonly projectiles: Projectile[] = [];
  readonly effects: Effect[] = [];
  /** Sound cues emitted this tick; the controller drains + clears them each rendered frame. */
  readonly audioEvents: AudioEvent[] = [];
  /** Floating damage numbers (cosmetic, browser-only); aged out by updatePopups. */
  readonly popups: Popup[] = [];
  readonly fog = new Fog();
  readonly config: MissionConfig;
  readonly difficulty: Difficulty;

  blocked = new Uint8Array(MAP_W * MAP_H);
  result: GameResult = 'playing';
  time = 0;
  private fogTimer = 0;
  private lastAlertTime = -99; // throttles the player "under attack" cue (see damage())

  constructor(config: MissionConfig, difficulty: Difficulty = 'normal') {
    this.config = config;
    this.difficulty = difficulty;
    const mods = DIFFICULTY[difficulty];
    this.player.credits = Math.round(config.playerCredits * mods.playerCreditMult);
    this.enemy.credits = Math.round(config.enemyCredits * mods.enemyCreditMult);

    for (const f of config.spiceFields) this.map.stampSpice(f.tx, f.ty, f.r);

    for (const b of config.buildings) {
      this.addBuilding(BUILDINGS[b.defId], b.faction, b.tx, b.ty, false);
    }
    this.rebuildBlocked();

    for (const u of config.units) {
      const def = UNITS[u.defId];
      const unit = this.spawnUnit(def, u.faction, (u.tx + 0.5) * TILE, (u.ty + 0.5) * TILE);
      if (def.harvester) unit.order = { kind: 'harvest' };
    }

    if (!config.fog) this.fog.revealAll();
    else this.refreshFog();
  }

  // ---- queries -----------------------------------------------------------------------------

  player_(faction: Faction): Player {
    return faction === 'player' ? this.player : this.enemy;
  }

  powerInfo(faction: Faction): { produced: number; consumed: number; factor: number } {
    let produced = 0;
    let consumed = 0;
    for (const b of this.buildings) {
      if (b.owner !== faction) continue;
      if (b.def.power > 0) produced += b.def.power;
      else consumed += -b.def.power;
    }
    const factor = consumed > produced
      ? Math.max(MIN_POWER_FACTOR, produced / Math.max(1, consumed))
      : 1;
    return { produced, consumed, factor };
  }

  ownedTypes(faction: Faction): Set<string> {
    const s = new Set<string>();
    for (const b of this.buildings) if (b.owner === faction) s.add(b.def.id);
    return s;
  }

  prereqsMet(faction: Faction, def: BuildingDef): boolean {
    const owned = this.ownedTypes(faction);
    return def.requires.every((r) => owned.has(r));
  }

  findBuilding(id: number): Building | undefined {
    return this.buildings.find((b) => b.id === id);
  }

  findUnit(id: number): Unit | undefined {
    return this.units.find((u) => u.id === id);
  }

  buildingAtTile(tx: number, ty: number): Building | undefined {
    return this.buildings.find((b) => b.coversTile(tx, ty));
  }

  unitsInRect(x0: number, y0: number, x1: number, y1: number, faction: Faction): Unit[] {
    const lo = { x: Math.min(x0, x1), y: Math.min(y0, y1) };
    const hi = { x: Math.max(x0, x1), y: Math.max(y0, y1) };
    return this.units.filter((u) =>
      u.owner === faction && u.x >= lo.x && u.x <= hi.x && u.y >= lo.y && u.y <= hi.y);
  }

  /** Enemy unit or building at a world point, from the perspective of `viewer`. */
  enemyEntityAt(wx: number, wy: number, viewer: Faction): Combatant | null {
    for (const u of this.units) {
      if (u.owner === viewer || !u.alive) continue;
      if (Math.hypot(u.x - wx, u.y - wy) <= u.def.radius + 6) return u;
    }
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    const b = this.buildingAtTile(tx, ty);
    if (b && b.owner !== viewer) return b;
    return null;
  }

  unitAt(wx: number, wy: number, faction: Faction): Unit | null {
    for (const u of this.units) {
      if (u.owner !== faction || !u.alive) continue;
      if (Math.hypot(u.x - wx, u.y - wy) <= u.def.radius + 6) return u;
    }
    return null;
  }

  // ---- production --------------------------------------------------------------------------

  canStartBuilding(faction: Faction, defId: string): boolean {
    const p = this.player_(faction);
    const def = BUILDINGS[defId];
    return p.building === null && p.ready === null
      && this.prereqsMet(faction, def) && p.credits >= def.cost;
  }

  startBuilding(faction: Faction, defId: string): boolean {
    if (!this.canStartBuilding(faction, defId)) return false;
    const p = this.player_(faction);
    const def = BUILDINGS[defId];
    p.credits -= def.cost;
    p.building = { defId, progress: 0, cost: def.cost, time: def.buildTime };
    return true;
  }

  canQueueUnit(faction: Faction, defId: string): boolean {
    const def = UNITS[defId];
    const p = this.player_(faction);
    return this.ownedTypes(faction).has(def.builtAt) && p.credits >= def.cost;
  }

  queueUnit(faction: Faction, defId: string): boolean {
    if (!this.canQueueUnit(faction, defId)) return false;
    const def = UNITS[defId];
    const p = this.player_(faction);
    p.credits -= def.cost;
    p.enqueueUnit(def.builtAt, { defId, progress: 0, cost: def.cost, time: def.buildTime });
    return true;
  }

  /** Create a unit, register it, and bake in the owner's current upgrade multipliers. */
  private spawnUnit(def: typeof UNITS[string], faction: Faction, x: number, y: number): Unit {
    const u = new Unit(def, faction, x, y);
    this.applyUpgradeStats(u);
    this.units.push(u);
    return u;
  }

  /** (Re)derive a unit's upgrade-scaled stats from its owner's purchased upgrades. Always
   *  computed from the base def (never compounded), so re-applying on a new purchase is safe. */
  private applyUpgradeStats(u: Unit): void {
    if (u.def.kind !== 'vehicle') return;       // HP/speed upgrades are vehicle-only
    const p = this.player_(u.owner);
    const frac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    u.maxHp = u.def.maxHp * p.upgradeMult('vehicleHpMult');
    u.hp = u.maxHp * frac;
    u.speedMult = p.upgradeMult('vehicleSpeedMult');
  }

  // ---- upgrades ----------------------------------------------------------------------------

  canPurchaseUpgrade(faction: Faction, id: string): boolean {
    const def = UPGRADES[id];
    if (!def) return false;
    const p = this.player_(faction);
    return !p.upgrades.has(id)
      && this.ownedTypes(faction).has(def.requires)
      && p.credits >= def.cost;
  }

  purchaseUpgrade(faction: Faction, id: string): boolean {
    if (!this.canPurchaseUpgrade(faction, id)) return false;
    const def = UPGRADES[id];
    const p = this.player_(faction);
    p.credits -= def.cost;
    p.upgrades.add(id);
    // HP/speed are baked per-unit, so retro-apply to every existing unit of this faction.
    if (def.effect === 'vehicleHpMult' || def.effect === 'vehicleSpeedMult') {
      for (const u of this.units) if (u.owner === faction) this.applyUpgradeStats(u);
    }
    return true;
  }

  /** Validity of placing `def` for `faction` with top-left at (tx,ty). */
  canPlace(faction: Faction, def: BuildingDef, tx: number, ty: number): boolean {
    for (let y = ty; y < ty + def.h; y++) {
      for (let x = tx; x < tx + def.w; x++) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
        if (this.buildingAtTile(x, y)) return false;
      }
    }
    // must sit near an existing friendly building (base cohesion)
    const cx = tx + def.w / 2, cy = ty + def.h / 2;
    return this.buildings.some((b) =>
      b.owner === faction
      && Math.abs(b.centerX / TILE - cx) <= def.w / 2 + b.def.w / 2 + 2
      && Math.abs(b.centerY / TILE - cy) <= def.h / 2 + b.def.h / 2 + 2);
  }

  placeReady(faction: Faction, tx: number, ty: number): Building | null {
    const p = this.player_(faction);
    if (!p.ready) return null;
    const def = BUILDINGS[p.ready];
    if (!this.canPlace(faction, def, tx, ty)) return null;
    const b = this.addBuilding(def, faction, tx, ty, true);
    p.ready = null;
    return b;
  }

  cancelReady(faction: Faction): void {
    const p = this.player_(faction);
    if (p.ready) { p.credits += BUILDINGS[p.ready].cost; p.ready = null; }
  }

  /** Cancel one queued unit of `defId` (full refund). Scans from the back so repeated cancels
   *  peel the rear of the queue without interrupting the near-finished front items. */
  cancelUnit(faction: Faction, defId: string): boolean {
    const p = this.player_(faction);
    const q = p.unitQueues.get(UNITS[defId].builtAt);
    if (!q) return false;
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].defId === defId) {
        p.credits += q[i].cost;
        q.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /** Cancel a structure that is ready-to-place or in progress (full refund). */
  cancelStructure(faction: Faction, defId: string): boolean {
    const p = this.player_(faction);
    if (p.ready === defId) {
      p.credits += BUILDINGS[defId].cost;
      p.ready = null;
      return true;
    }
    if (p.building && p.building.defId === defId) {
      p.credits += p.building.cost;
      p.building = null;
      return true;
    }
    return false;
  }

  /** Set a producer building's rally point (snapped to a reachable tile center). */
  setRally(b: Building, wx: number, wy: number): void {
    if (!b.isProducer) return;
    const goal = nearestOpen(this.blocked, Math.floor(wx / TILE), Math.floor(wy / TILE));
    b.rallyX = (goal.tx + 0.5) * TILE;
    b.rallyY = (goal.ty + 0.5) * TILE;
  }

  clearRally(b: Building): void {
    b.rallyX = null;
    b.rallyY = null;
  }

  private addBuilding(def: BuildingDef, faction: Faction, tx: number, ty: number,
                      spawnHarvester: boolean): Building {
    const b = new Building(def, faction, tx, ty);
    this.buildings.push(b);
    // clear the footprint to sand so nothing draws under it
    for (let y = ty; y < ty + def.h; y++) {
      for (let x = tx; x < tx + def.w; x++) {
        if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) {
          this.map.terrain[this.map.idx(x, y)] = Terrain.Rock;
          this.map.spice[this.map.idx(x, y)] = 0;
        }
      }
    }
    this.rebuildBlocked();
    if (spawnHarvester && def.spawnsHarvester) {
      const u = this.spawnUnit(UNITS.harvester, faction, b.exitX, b.exitY);
      u.order = { kind: 'harvest' };
    }
    return b;
  }

  private completeUnit(faction: Faction, defId: string, producer: Building): void {
    const def = UNITS[defId];
    if (faction === 'player') this.emit('unit-ready');
    const exitTile = nearestOpen(this.blocked,
      Math.floor(producer.exitX / TILE), Math.floor(producer.exitY / TILE));
    const u = this.spawnUnit(def, faction, (exitTile.tx + 0.5) * TILE, (exitTile.ty + 0.5) * TILE);

    const rx = producer.rallyX, ry = producer.rallyY;
    if (rx === null || ry === null) {
      // no rally — default behaviour (harvesters harvest, combat idles at exit)
      if (def.harvester) u.order = { kind: 'harvest' };
      return;
    }
    if (def.harvester) {
      // If the rally sits on spice, send the harvester to mine there; else just move.
      const rtx = Math.floor(rx / TILE), rty = Math.floor(ry / TILE);
      if (this.map.inBounds(rtx, rty)
          && this.map.terrain[this.map.idx(rtx, rty)] === Terrain.Spice) {
        u.spiceTile = { tx: rtx, ty: rty };
        u.harvestPhase = 'toSpice';
        u.order = { kind: 'harvest' };
      } else {
        u.order = { kind: 'harvest' };          // default harvest loop
        this.commandMove([u], rx, ry);          // but first drive out to the rally
      }
    } else {
      // Combat/other units attack-move to the rally (commandAttackMove falls back to
      // a plain move for weaponless units automatically).
      this.commandAttackMove([u], rx, ry);
    }
  }

  // ---- commands (issued by selection / AI) -------------------------------------------------

  commandMove(units: Unit[], wx: number, wy: number): void {
    const goal = nearestOpen(this.blocked, Math.floor(wx / TILE), Math.floor(wy / TILE));
    for (const u of units) {
      if (u.def.flying) {
        u.order = { kind: 'move', gx: wx, gy: wy };
        u.clearPath();
      } else {
        u.path = findPath(this.blocked, u.tileX, u.tileY, goal.tx, goal.ty) ?? [];
        u.pathGoal = goal;
        u.order = { kind: 'move', gx: (goal.tx + 0.5) * TILE, gy: (goal.ty + 0.5) * TILE };
      }
    }
  }

  commandAttack(units: Unit[], target: Combatant): void {
    for (const u of units) {
      if (!u.def.weapon) continue;
      u.order = { kind: 'attack', targetId: target.id, targetKind: target.entityKind };
      u.clearPath();
      u.repathTimer = 0;
    }
  }

  commandStop(units: Unit[]): void {
    for (const u of units) this.becomeIdle(u);
  }

  /** Advance to a point, engaging any enemy encountered en route (classic A-move). */
  commandAttackMove(units: Unit[], wx: number, wy: number): void {
    const goal = nearestOpen(this.blocked, Math.floor(wx / TILE), Math.floor(wy / TILE));
    for (const u of units) {
      if (!u.def.weapon) { this.commandMove([u], wx, wy); continue; }
      if (u.def.flying) {
        u.order = { kind: 'attackMove', gx: wx, gy: wy };
        u.clearPath();
      } else {
        u.path = findPath(this.blocked, u.tileX, u.tileY, goal.tx, goal.ty) ?? [];
        u.pathGoal = goal;
        u.order = { kind: 'attackMove', gx: (goal.tx + 0.5) * TILE, gy: (goal.ty + 0.5) * TILE };
      }
    }
  }

  /** Hold position: do not move, but fire on anything that enters weapon range. */
  commandHold(units: Unit[]): void {
    for (const u of units) {
      if (u.def.harvester) { this.becomeIdle(u); continue; }
      u.order = { kind: 'hold' };
      u.guardX = u.x; u.guardY = u.y;
      u.clearPath();
    }
  }

  /** Guard the current spot: defend it and return after chasing (sets Guard stance). */
  commandGuard(units: Unit[]): void {
    for (const u of units) {
      if (u.def.weapon) u.stance = 'guard';
      this.becomeIdle(u);
    }
  }

  setStance(units: Unit[], stance: Stance): void {
    for (const u of units) if (u.def.weapon) u.stance = stance;
  }

  /** Right-click behaviour: attack an enemy, harvest clicked spice, else move. */
  commandSmart(units: Unit[], wx: number, wy: number): void {
    const faction = units[0]?.owner ?? 'player';
    const enemy = this.enemyEntityAt(wx, wy, faction);
    if (enemy) {
      const attackers = units.filter((u) => u.def.weapon);
      const movers = units.filter((u) => !u.def.weapon);
      if (attackers.length) this.commandAttack(attackers, enemy);
      if (movers.length) this.commandMove(movers, wx, wy);
      return;
    }
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    const onSpice = this.map.inBounds(tx, ty)
      && this.map.terrain[this.map.idx(tx, ty)] === Terrain.Spice;
    const harvesters = units.filter((u) => u.def.harvester);
    const others = units.filter((u) => !u.def.harvester);
    if (onSpice && harvesters.length) {
      for (const h of harvesters) {
        h.spiceTile = { tx, ty };
        h.harvestPhase = 'toSpice';
        h.order = { kind: 'harvest' };
        h.clearPath();
      }
    } else if (harvesters.length) {
      this.commandMove(harvesters, wx, wy);
    }
    if (others.length) this.commandMove(others, wx, wy);
  }

  // ---- main tick ---------------------------------------------------------------------------

  update(dt: number): void {
    if (this.result !== 'playing') {
      this.updateEffects(dt);
      this.updatePopups(dt);
      this.updateProjectiles(dt);
      return;
    }
    this.time += dt;

    this.updateProduction(this.player, dt);
    this.updateProduction(this.enemy, dt);
    this.updateUnits(dt);
    this.updateTurrets(dt);
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.updatePopups(dt);
    this.cleanup();

    this.fogTimer -= dt;
    if (this.fogTimer <= 0) { this.refreshFog(); this.fogTimer = FOG_REFRESH; }

    this.checkVictory();
  }

  private updateProduction(p: Player, dt: number): void {
    const f = this.powerInfo(p.faction).factor;
    if (p.building) {
      p.building.progress += (dt * f) / Math.max(0.01, p.building.time);
      if (p.building.progress >= 1) {
        p.ready = p.building.defId;
        p.building = null;
        if (p.faction === 'player') this.emit('build-ready');
      }
    }
    for (const [builtAt, q] of p.unitQueues) {
      if (q.length === 0) continue;
      // N producer buildings of this type build the first N queued items concurrently, so a
      // second Barracks/War Factory actually doubles throughput.
      const producers = this.buildings.filter(
        (b) => b.owner === p.faction && b.def.id === builtAt && b.alive);
      if (producers.length === 0) continue;
      let slots = Math.min(producers.length, q.length);
      for (let i = 0; i < slots; i++) {
        q[i].progress += (dt * f) / Math.max(0.01, q[i].time);
      }
      // Finish any completed items within the advanced window, distributing the spawned units
      // across the producer buildings round-robin (so each exits at — and rallies from — the
      // building that built it). Handles out-of-order completion (a cheaper item ahead may
      // finish before a slower one in the same window).
      let prodIdx = 0;
      for (let i = 0; i < slots; i++) {
        if (q[i] && q[i].progress >= 1) {
          const item = q[i];
          q.splice(i, 1);
          this.completeUnit(p.faction, item.defId, producers[prodIdx % producers.length]);
          prodIdx++;
          i--; slots--; // a slot in the advanced window was consumed
        }
      }
    }
  }

  private updateUnits(dt: number): void {
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.cooldown > 0) u.cooldown -= dt;
      if (u.muzzleFlash > 0) u.muzzleFlash -= dt;
      if (u.repathTimer > 0) u.repathTimer -= dt;
      this.behave(u, dt);
    }
    this.separate(dt);
  }

  private behave(u: Unit, dt: number): void {
    switch (u.order.kind) {
      case 'harvest':
        this.harvest(u, dt);
        return;

      case 'move':
        // Honour the move, but defend ourselves: fire (without stopping) at anything in range.
        this.fireIfInRange(u);
        if (u.def.flying) {
          if (u.stepToward(u.order.gx!, u.order.gy!, dt)) this.becomeIdle(u);
        } else if (u.followPath(dt)) {
          this.becomeIdle(u);
        }
        return;

      case 'attack': {
        let t = this.resolveTarget(u);
        if (!t) {
          // assigned target gone — chain to the next enemy in sight, else stand down.
          t = u.stance === 'holdfire' ? null : this.acquireTarget(u);
          if (t) u.order = { kind: 'attack', targetId: t.id, targetKind: t.entityKind };
          else { this.becomeIdle(u); return; }
        }
        this.engage(u, t, dt);
        return;
      }

      case 'attackMove': {
        const t = u.stance === 'holdfire' ? null : this.acquireTarget(u);
        if (t) { this.engage(u, t, dt); return; }
        // no enemy — resume advancing toward the destination
        if (u.def.flying) {
          if (u.stepToward(u.order.gx!, u.order.gy!, dt)) this.becomeIdle(u);
        } else {
          this.ensurePathTo(u, Math.floor(u.order.gx! / TILE), Math.floor(u.order.gy! / TILE));
          // straight-line fallback when no route exists (avoid freezing in a pocket)
          if (u.path.length === 0) {
            if (u.stepToward(u.order.gx!, u.order.gy!, dt)) this.becomeIdle(u);
          } else if (u.followPath(dt)) {
            this.becomeIdle(u);
          }
        }
        return;
      }

      case 'hold':
        this.fireIfInRange(u);
        return;

      default: // idle — stance-driven autonomous behaviour
        this.autonomous(u, dt);
    }
  }

  /** Fire at the nearest in-range enemy without moving (used while moving / holding). */
  private fireIfInRange(u: Unit): void {
    if (!u.def.weapon || u.stance === 'holdfire') return;
    const t = this.acquireTarget(u);
    if (t && this.inWeaponRange(u, t)) this.tryFire(u, t);
  }

  /** Stance-driven behaviour for a unit with no active order. */
  private autonomous(u: Unit, dt: number): void {
    if (!u.def.weapon || u.stance === 'holdfire') return;
    if (u.stance === 'holdground') { this.fireIfInRange(u); return; }

    const sightTiles = u.stance === 'aggressive' ? u.def.sight * 1.6 : u.def.sight;
    const leash = (u.stance === 'aggressive' ? AGGRO_LEASH : GUARD_LEASH) * TILE;
    const t = this.acquireTarget(u, sightTiles);
    if (t) {
      if (this.inWeaponRange(u, t)) { this.tryFire(u, t); return; }
      const fromPost = Math.hypot(u.x - u.guardX, u.y - u.guardY);
      if (fromPost <= leash) { this.engage(u, t, dt); return; }
    }
    this.returnToGuard(u, dt);
  }

  /** Drift back toward the unit's guard post when not engaged. */
  private returnToGuard(u: Unit, dt: number): void {
    if (u.distanceTo(u.guardX, u.guardY) <= TILE) { u.clearPath(); return; }
    if (u.def.flying) { u.stepToward(u.guardX, u.guardY, dt); return; }
    this.ensurePathTo(u, Math.floor(u.guardX / TILE), Math.floor(u.guardY / TILE));
    u.followPath(dt);
  }

  /** Return a unit to rest: harvesters resume harvesting, others guard their current spot. */
  private becomeIdle(u: Unit): void {
    u.clearPath();
    if (u.def.harvester) {
      u.order = { kind: 'harvest' };
      u.harvestPhase = 'toSpice';
      u.spiceTile = null;
    } else {
      u.order = { kind: 'idle' };
      u.guardX = u.x;
      u.guardY = u.y;
    }
  }

  private engage(u: Unit, target: Combatant, dt: number): void {
    const w = u.def.weapon;
    if (!w) { this.becomeIdle(u); return; }
    // Can't engage a flyer without an anti-air weapon — stand down rather than chase forever.
    if (target.entityKind === 'unit' && target.def.flying && !canHitAir(w)) {
      this.becomeIdle(u);
      return;
    }
    const cx = centerX(target), cy = centerY(target);
    // A min-range weapon caught too close backs off to re-open the firing gap (artillery kite).
    if (w.minRange && (cx - u.x) ** 2 + (cy - u.y) ** 2 < w.minRange * w.minRange) {
      const ang = Math.atan2(u.y - cy, u.x - cx);
      u.clearPath();
      u.stepToward(u.x + Math.cos(ang) * TILE, u.y + Math.sin(ang) * TILE, dt);
      return;
    }
    if (this.inWeaponRange(u, target)) {
      u.clearPath();
      this.tryFire(u, target);
    } else if (u.def.flying) {
      u.stepToward(cx, cy, dt);
    } else {
      this.ensurePathTo(u, Math.floor(cx / TILE), Math.floor(cy / TILE));
      // If no route exists (e.g. the unit spawned in a base pocket the A* can't escape, or the
      // target is enclosed), nudge straight toward it so the unit never freezes — separation
      // slides it along walls until it reaches open ground and can path normally again.
      if (u.path.length === 0) u.stepToward(cx, cy, dt);
      else u.followPath(dt);
    }
  }

  private harvest(u: Unit, dt: number): void {
    switch (u.harvestPhase) {
      case 'toSpice': {
        if (!u.spiceTile || this.map.terrain[this.map.idx(u.spiceTile.tx, u.spiceTile.ty)] !== Terrain.Spice) {
          const s = this.map.nearestSpice(u.x, u.y);
          if (!s) return; // no spice anywhere; wait
          u.spiceTile = s;
          u.clearPath();
        }
        this.ensurePathTo(u, u.spiceTile.tx, u.spiceTile.ty);
        const arrived = u.followPath(dt);
        if (arrived || (u.tileX === u.spiceTile.tx && u.tileY === u.spiceTile.ty)) {
          u.harvestPhase = 'mining';
        }
        return;
      }
      case 'mining': {
        if (!u.spiceTile) { u.harvestPhase = 'toSpice'; return; }
        const got = this.map.mineAt(u.spiceTile.tx, u.spiceTile.ty, HARVEST_RATE * dt);
        u.load += got;
        // Full: prioritise returning to bank the load — don't keep topping off.
        if (u.load >= HARVESTER_CAPACITY) {
          u.spiceTile = null;
          u.clearPath();
          u.harvestPhase = 'toRefinery';
          return;
        }
        // Tile ran dry before we filled up: keep mining if there's more spice within the visual
        // leash; otherwise bank what we have (and find a fresh patch after unloading).
        if (got <= 0) {
          u.spiceTile = null;
          u.clearPath();
          const next = this.map.nearestSpice(u.x, u.y);
          const leash = HARVEST_LEASH * TILE;
          if (next && Math.hypot((next.tx + 0.5) * TILE - u.x, (next.ty + 0.5) * TILE - u.y) <= leash) {
            u.spiceTile = next;
            u.harvestPhase = 'toSpice';
          } else {
            u.harvestPhase = u.load > 0 ? 'toRefinery' : 'toSpice';
          }
        }
        return;
      }
      case 'toRefinery': {
        const ref = this.nearestRefinery(u);
        if (!ref) return; // no refinery; wait with full load
        this.ensurePathTo(u, Math.floor(ref.exitX / TILE), Math.floor(ref.exitY / TILE));
        const arrived = u.followPath(dt);
        if (arrived || u.distanceTo(ref.exitX, ref.exitY) < TILE) u.harvestPhase = 'unloading';
        return;
      }
      case 'unloading': {
        const ref = this.nearestRefinery(u);
        if (!ref) { u.harvestPhase = 'toSpice'; return; }
        const amt = Math.min(u.load, UNLOAD_RATE * dt);
        u.load -= amt;
        const p = this.player_(u.owner);
        p.credits += (amt / SPICE_PER_CREDIT) * p.upgradeMult('harvestMult');
        if (u.load <= 0) { u.load = 0; u.harvestPhase = 'toSpice'; }
        return;
      }
    }
  }

  private nearestRefinery(u: Unit): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.owner !== u.owner || b.def.id !== 'refinery' || !b.alive) continue;
      const d = u.distanceTo(b.exitX, b.exitY);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  private acquireTarget(u: Unit, sightTiles = u.def.sight): Combatant | null {
    const range = sightTiles * TILE;
    let best: Combatant | null = null;
    let bestD = range * range;
    const hitsAir = canHitAir(u.def.weapon);
    for (const e of this.units) {
      if (e.owner === u.owner || !e.alive) continue;
      if (e.def.flying && !hitsAir) continue;
      const d = (e.x - u.x) ** 2 + (e.y - u.y) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    for (const b of this.buildings) {
      if (b.owner === u.owner || !b.alive) continue;
      const d = (b.centerX - u.x) ** 2 + (b.centerY - u.y) ** 2;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  private resolveTarget(u: Unit): Combatant | null {
    if (u.order.targetKind === 'unit') {
      const t = this.findUnit(u.order.targetId!);
      return t && t.alive ? t : null;
    }
    const b = this.findBuilding(u.order.targetId!);
    return b && b.alive ? b : null;
  }

  private inWeaponRange(u: Unit, t: Combatant): boolean {
    const w = u.def.weapon!;
    const d2 = (centerX(t) - u.x) ** 2 + (centerY(t) - u.y) ** 2;
    const max = w.range + targetRadius(t);
    if (d2 > max * max) return false;
    if (w.minRange && d2 < w.minRange * w.minRange) return false; // too close (artillery)
    return true;
  }

  private tryFire(u: Unit, t: Combatant): void {
    if (u.cooldown > 0) return;
    const w = u.def.weapon!;
    u.facing = Math.atan2(centerY(t) - u.y, centerX(t) - u.x);
    this.fire(u.owner, w, u.x, u.y, t);
    u.cooldown = w.cooldown;
    u.muzzleFlash = 0.08;
  }

  /** Queue a sound cue for the controller to play (browser only — inert in the headless sim). */
  private emit(name: string, x = 0, y = 0): void {
    if (IN_BROWSER) this.audioEvents.push({ name, x, y });
  }

  /** Apply a weapon's hit: armor-scaled damage to the target (+ splash), and a visual tracer.
   *  Damage = base × owner's damage upgrade × DAMAGE_VS_ARMOR[type][target armor]. */
  private fire(owner: Faction, weapon: WeaponDef, fromX: number, fromY: number,
               target: Combatant): void {
    const tx = centerX(target), ty = centerY(target);
    const base = weapon.damage * this.player_(owner).upgradeMult('damageMult');
    this.damage(target, base * damageMultiplier(weapon.type, armorOf(target)));
    if (weapon.splash) this.splash(owner, weapon, base, tx, ty, target.id);
    this.projectiles.push(new Projectile(owner, weapon, fromX, fromY, tx, ty));
    this.emit(`fire-${weapon.type}`, fromX, fromY); // controller gates this to on-screen shots
  }

  private damage(target: Combatant, amount: number): void {
    target.hp -= amount;
    target.hitFlash = this.time + HIT_FLASH_TIME;      // cosmetic white flash (renderer reads time)
    const ex = centerX(target), ey = centerY(target);
    if (IN_BROWSER && amount >= 1) {                    // floating damage number (cosmetic)
      this.popups.push({
        x: ex, y: top(target), amount: Math.round(amount),
        ttl: POPUP_TTL, max: POPUP_TTL, friendly: target.owner === 'player',
      });
    }
    if (target.hp <= 0) {
      const building = target.entityKind === 'building';
      // Infantry "poof" into dust; vehicles, aircraft, and buildings get a fiery blast.
      const infantry = target.entityKind === 'unit' && target.def.kind === 'infantry';
      const size = building ? 36 : infantry ? 13 : 18;
      this.effects.push({
        x: ex, y: ey, ttl: CORPSE_TTL, max: CORPSE_TTL, size,
        kind: infantry ? 'poof' : 'blast',
      });
      this.emit(building ? 'explosion-big' : 'explosion', ex, ey);
    } else if (target.owner === 'player' && this.time - this.lastAlertTime > 0.5) {
      // A player unit/building is taking fire (and survived the hit): nudge an "under attack"
      // alert. Coarse-throttled here; the audio layer enforces the real ~8s spacing.
      this.lastAlertTime = this.time;
      this.emit('under-attack');
    }
  }

  private splash(owner: Faction, weapon: WeaponDef, base: number, x: number, y: number,
                 skipId: number): void {
    const radius = weapon.splash!;
    const r2 = radius * radius;
    for (const e of this.units) {
      if (e.owner === owner || !e.alive || e.id === skipId) continue;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r2) {
        this.damage(e, base * 0.5 * damageMultiplier(weapon.type, e.def.armor));
      }
    }
  }

  private updateTurrets(dt: number): void {
    for (const b of this.buildings) {
      if (!b.def.weapon || !b.alive) continue;
      if (b.cooldown > 0) b.cooldown -= dt;
      if (b.muzzleFlash > 0) b.muzzleFlash -= dt;
      if (b.cooldown > 0) continue;
      const t = this.nearestEnemyInRange(b);
      if (t) {
        this.fire(b.owner, b.def.weapon, b.centerX, b.centerY, t);
        b.cooldown = b.def.weapon.cooldown;
        b.muzzleFlash = 0.1;
      }
    }
  }

  private nearestEnemyInRange(b: Building): Combatant | null {
    const range = b.def.weapon!.range;
    const hitsAir = canHitAir(b.def.weapon);
    let best: Combatant | null = null;
    let bestD = Infinity;
    for (const e of this.units) {
      if (e.owner === b.owner || !e.alive) continue;
      if (e.def.flying && !hitsAir) continue;
      const d = Math.hypot(e.x - b.centerX, e.y - b.centerY);
      if (d <= range + e.def.radius && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) p.update(dt);
  }

  private updateEffects(dt: number): void {
    for (const e of this.effects) e.ttl -= dt;
  }

  // Age + retire floating damage numbers (cosmetic; only ever populated in the browser).
  private updatePopups(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.ttl -= dt;
      if (p.ttl <= 0) this.popups.splice(i, 1);
    }
  }

  private separate(dt: number): void {
    const r2 = SEPARATION_RADIUS * SEPARATION_RADIUS;
    for (let i = 0; i < this.units.length; i++) {
      const a = this.units[i];
      if (a.def.flying || !a.alive) continue;
      for (let j = i + 1; j < this.units.length; j++) {
        const b = this.units[j];
        if (b.def.flying || !b.alive) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (SEPARATION_RADIUS - d) / SEPARATION_RADIUS * SEPARATION_FORCE * dt;
        const nx = dx / d, ny = dy / d;
        a.x += nx * push; a.y += ny * push;
        b.x -= nx * push; b.y -= ny * push;
      }
    }
  }

  private ensurePathTo(u: Unit, tx: number, ty: number): void {
    const goal = nearestOpen(this.blocked, tx, ty);
    const same = u.pathGoal && u.pathGoal.tx === goal.tx && u.pathGoal.ty === goal.ty;
    if (same && u.path.length > 0) return;
    if (u.repathTimer > 0 && same) return;
    u.path = findPath(this.blocked, u.tileX, u.tileY, goal.tx, goal.ty) ?? [];
    u.pathGoal = goal;
    u.repathTimer = 0.4;
  }

  private cleanup(): void {
    let buildingDied = false;
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      if (!this.buildings[i].alive) { this.buildings.splice(i, 1); buildingDied = true; }
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (!this.units[i].alive) this.units.splice(i, 1);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (this.effects[i].ttl <= 0) this.effects.splice(i, 1);
    }
    if (buildingDied) this.rebuildBlocked();
  }

  private rebuildBlocked(): void {
    this.blocked.fill(0);
    for (const b of this.buildings) {
      for (let y = b.ty; y < b.ty + b.def.h; y++) {
        for (let x = b.tx; x < b.tx + b.def.w; x++) {
          if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) this.blocked[y * MAP_W + x] = 1;
        }
      }
    }
    // The block grid just changed (a building was placed or destroyed). Any unit whose active
    // path now runs through a blocked tile must repath immediately, or it would clip through the
    // new building for up to `repathTimer` (0.4s). (Units is empty during the constructor's calls.)
    for (const u of this.units) {
      if (!u.alive || u.path.length === 0) continue;
      for (const wp of u.path) {
        if (this.blocked[wp.ty * MAP_W + wp.tx]) { u.clearPath(); u.repathTimer = 0; break; }
      }
    }
  }

  private refreshFog(): void {
    if (!this.config.fog) return;
    this.fog.recompute(
      this.units.filter((u) => u.owner === 'player'),
      this.buildings.filter((b) => b.owner === 'player'),
    );
  }

  private checkVictory(): void {
    if (this.time < 0.5) return;
    // Losing your whole base is always a loss, whatever the objective.
    if (!this.buildings.some((b) => b.owner === 'player')) { this.result = 'lost'; return; }
    const enemyGone = !this.buildings.some((b) => b.owner === 'enemy');
    const obj = this.config.objective;
    switch (obj?.kind ?? 'destroyAll') {
      case 'destroyAll':
        if (enemyGone) this.result = 'won';
        break;
      case 'destroyTarget':
        // Win when the named enemy structure is gone (or the whole enemy base is).
        if (enemyGone || !this.buildings.some(
          (b) => b.owner === 'enemy' && b.def.id === obj!.targetDefId)) this.result = 'won';
        break;
      case 'survive':
        // Hold out until the clock — wiping the enemy early counts as a win too.
        if (enemyGone || this.time >= (obj!.timeLimit ?? 300)) this.result = 'won';
        break;
      case 'defend':
        if (!this.buildings.some((b) => b.owner === 'player' && b.def.id === obj!.targetDefId)) {
          this.result = 'lost'; // the protected structure fell
        } else if (enemyGone || this.time >= (obj!.timeLimit ?? 300)) {
          this.result = 'won';
        }
        break;
    }
  }
}

// ---- free helpers (combatant geometry) -----------------------------------------------------
export function centerX(e: Combatant): number {
  return e.entityKind === 'unit' ? e.x : e.centerX;
}
export function centerY(e: Combatant): number {
  return e.entityKind === 'unit' ? e.y : e.centerY;
}
function targetRadius(e: Combatant): number {
  return e.entityKind === 'unit' ? e.def.radius : Math.max(e.def.w, e.def.h) * TILE * 0.5;
}
/** Y just above a combatant — where floating damage numbers spawn. */
function top(e: Combatant): number {
  return centerY(e) - targetRadius(e) - 2;
}
function armorOf(e: Combatant): ArmorClass {
  return e.entityKind === 'unit' ? e.def.armor : 'building';
}
function canHitAir(weapon: WeaponDef | undefined): boolean {
  return !!weapon?.canTargetAir;
}
