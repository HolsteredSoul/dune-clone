// A pragmatic skirmish AI for the enemy faction. On a think interval it: places any finished
// building, starts the next structure in its build order, trains harvesters/army, and once it
// has a wave, marches the whole army at the player's nearest building.
//
// One brain, several PERSONALITIES: a set of knobs (build order, aggression, army cap, comp,
// economy focus) lets the enemy play turtle / rusher / mechanized / economist instead of a single
// scripted style. 'balanced' reproduces the historical campaign behaviour exactly, so a mission
// with no personality set is byte-identical to before.

import { BUILDINGS, UNITS, DIFFICULTY } from './defs';
import type { DifficultyMods } from './defs';
import { TILE } from './constants';
import type { World } from './world';
import type { Building } from './building';
import type { Unit } from './unit';

interface BuildStep { id: string; min: number; }

// Default ("balanced") structure priorities — the historical campaign build order.
const BUILD_ORDER: BuildStep[] = [
  { id: 'power', min: 1 },
  { id: 'refinery', min: 1 },
  { id: 'barracks', min: 1 },
  { id: 'power', min: 2 },
  { id: 'radar', min: 1 },
  { id: 'turret', min: 1 },
  { id: 'factory', min: 1 },
  { id: 'turret', min: 2 },
  { id: 'power', min: 3 },
  { id: 'refinery', min: 2 },
];

// Turtle: turrets early and often, teches behind a wall, commits late but with a bigger army.
const TURTLE_ORDER: BuildStep[] = [
  { id: 'power', min: 1 }, { id: 'refinery', min: 1 }, { id: 'barracks', min: 1 },
  { id: 'turret', min: 1 }, { id: 'power', min: 2 }, { id: 'turret', min: 2 },
  { id: 'radar', min: 1 }, { id: 'factory', min: 1 }, { id: 'turret', min: 3 },
  { id: 'power', min: 3 }, { id: 'refinery', min: 2 },
];
// Rusher: lean structures, defers the factory, floods cheap infantry and commits as early as the
// anti-stomp grace allows.
const RUSH_ORDER: BuildStep[] = [
  { id: 'power', min: 1 }, { id: 'refinery', min: 1 }, { id: 'barracks', min: 1 },
  { id: 'power', min: 2 }, { id: 'radar', min: 1 }, { id: 'turret', min: 1 },
  { id: 'refinery', min: 2 }, { id: 'factory', min: 1 },
];
// Mechanized: rushes the War Factory and fields tank-heavy armies from two factories.
const MECH_ORDER: BuildStep[] = [
  { id: 'power', min: 1 }, { id: 'refinery', min: 1 }, { id: 'barracks', min: 1 },
  { id: 'power', min: 2 }, { id: 'factory', min: 1 }, { id: 'radar', min: 1 },
  { id: 'turret', min: 1 }, { id: 'power', min: 3 }, { id: 'refinery', min: 2 },
  { id: 'factory', min: 2 }, { id: 'turret', min: 2 },
];
// Economist: double refinery early, more harvesters and upgrades, late but oversized army.
const ECON_ORDER: BuildStep[] = [
  { id: 'power', min: 1 }, { id: 'refinery', min: 1 }, { id: 'refinery', min: 2 },
  { id: 'barracks', min: 1 }, { id: 'power', min: 2 }, { id: 'radar', min: 1 },
  { id: 'factory', min: 1 }, { id: 'turret', min: 1 }, { id: 'power', min: 3 },
  { id: 'refinery', min: 3 },
];

/** A behavioural archetype: knobs over the one EnemyAI brain. 'balanced' = historical behaviour. */
export interface AIPersonality {
  id: string;
  name: string;
  blurb: string;             // one-line style description (skirmish AI picker; cosmetic, never read by sim)
  buildOrder: BuildStep[];
  aggressionMult: number;    // scales effective aggression (wave size + how soon it commits)
  waveCapMult: number;       // scales the standing-army / wave cap
  rocketRatio: number;       // Rocket Troopers per rifleman (anti-armour / anti-air mix)
  infReserveEco: number;     // credit reserve before flooding infantry, once economy is up
  infReservePre: number;     // ... before the economy backbone exists (anti turn-1 rush)
  upgradeThreshold: number;  // surplus credits before sinking one into a damage upgrade
  harvesterTarget: number;   // desired harvester count (economy focus)
  siegeTarget: number;       // desired Artillery count (siege to crack turtle walls; 0 = none)
}

export const PERSONALITIES: Record<string, AIPersonality> = {
  balanced:   { id: 'balanced',   name: 'Balanced',   blurb: 'Well-rounded — steady economy, mixed army.',    buildOrder: BUILD_ORDER, aggressionMult: 1.0,  waveCapMult: 1.0,  rocketRatio: 0.5,  infReserveEco: 250, infReservePre: 700, upgradeThreshold: 1500, harvesterTarget: 2, siegeTarget: 2 },
  turtle:     { id: 'turtle',     name: 'Turtle',     blurb: 'Walls up with turrets, strikes late but bigger.', buildOrder: TURTLE_ORDER, aggressionMult: 0.85, waveCapMult: 1.15, rocketRatio: 0.6,  infReserveEco: 300, infReservePre: 700, upgradeThreshold: 1300, harvesterTarget: 2, siegeTarget: 3 },
  rusher:     { id: 'rusher',     name: 'Rusher',     blurb: 'Floods cheap infantry and commits early.',        buildOrder: RUSH_ORDER,   aggressionMult: 1.35, waveCapMult: 0.9,  rocketRatio: 0.35, infReserveEco: 150, infReservePre: 450, upgradeThreshold: 2200, harvesterTarget: 2, siegeTarget: 0 },
  mechanized: { id: 'mechanized', name: 'Mechanized', blurb: 'Factory-first, tank-heavy pushes.',                buildOrder: MECH_ORDER,   aggressionMult: 0.95, waveCapMult: 1.0,  rocketRatio: 0.4,  infReserveEco: 400, infReservePre: 800, upgradeThreshold: 1400, harvesterTarget: 2, siegeTarget: 2 },
  economist:  { id: 'economist',  name: 'Economist',  blurb: 'Booms the economy, late oversized army.',          buildOrder: ECON_ORDER,   aggressionMult: 0.85, waveCapMult: 1.2,  rocketRatio: 0.5,  infReserveEco: 300, infReservePre: 800, upgradeThreshold: 1200, harvesterTarget: 3, siegeTarget: 3 },
};

/** Display order for the skirmish AI-personality picker (balanced first = the safe default). */
export const PERSONALITY_ORDER: string[] = ['balanced', 'rusher', 'turtle', 'mechanized', 'economist'];

/** Army-level tactical phase (deterministic FSM state; serialized for save/load). */
export type ArmyPhase = 'massing' | 'probe' | 'assault' | 'regroup';

/** Persisted EnemyAI state. The tactical fields are optional so an older/partial snapshot still
 *  restores cleanly (SAVE_VERSION is bumped so genuinely stale saves are rejected upstream). */
export interface AISnapshot {
  think: number;
  waveSize: number;
  holdUntil: number;
  attacking: boolean;
  phase?: ArmyPhase;
  phaseUntil?: number;
  rallyX?: number;
  rallyY?: number;
  rng?: number;
  lastTargetId?: number;
}

// Tactical tuning — module-level so the per-personality matrix stays small (difficulty is still
// governed by the existing waveCap / aggression knobs, tuned first when rebalancing).
const RETREAT_HP_FRAC = 0.28;    // a unit below this HP fraction pulls back to base to survive
const FLANK_OFFSET_TILES = 6;    // lateral offset of the flank approach waypoint
const COMMIT_FRAC = 0.55;        // commit to an assault once the army reaches this fraction of the cap
const DISENGAGE_FLOOR = 3;       // pull back and re-mass once a committed army falls to this size

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

export class EnemyAI {
  private think = 1;
  private waveSize = 4;
  private readonly waveCap: number; // personality-scaled army cap (was mods.waveCap)
  private holdUntil: number;        // sim time before which the AI won't launch its first wave
  private readonly mods: DifficultyMods;
  private readonly p: AIPersonality;

  // Tactical FSM state — all serialized for save/load; fully deterministic (no Math.random).
  private attacking = false;
  private phase: ArmyPhase = 'massing';
  private phaseUntil = 0;     // world.time gate for min phase dwell + seeded timing variety
  private rallyX = 0;         // current group move waypoint (staging / flank), cached across ticks
  private rallyY = 0;
  private lastTargetId = 0;   // current assault focus-target id (0 = none)
  private rng = 1;            // mulberry32 state — the ONLY entropy source in the AI

  constructor(private readonly world: World, aggression = 1, personality = 'balanced') {
    this.mods = DIFFICULTY[world.difficulty];
    this.p = PERSONALITIES[personality] ?? PERSONALITIES.balanced;
    this.waveCap = Math.max(4, Math.round(this.mods.waveCap * this.p.waveCapMult));
    // Effective aggression blends mission intent × difficulty × personality.
    const effAggression = aggression * this.mods.aggressionMult * this.p.aggressionMult;
    // First-wave size as a fraction of the wave cap, nudged by aggression. Kept small so the
    // opening wave is a probe, not a knockout: the game is decided over several exchanges
    // rather than one decisive ~30s blob. Subsequent waves grow toward the cap in commandArmy().
    const frac = Math.min(0.6, 0.34 + 0.14 * effAggression);
    this.waveSize = Math.max(4, Math.round(this.waveCap * frac));
    // Hold the opening army back for a grace period so a pre-placed standing army (M2/M3)
    // doesn't insta-rush at t=0; the grace shrinks with aggression so harder missions hit
    // sooner. The FLOOR is the anti-stomp guard: even the most aggressive mission/difficulty/
    // personality grants the player time to stand up a defence before the first wave (no <90s
    // stomps, keeping match length in the target band rather than ending in a sub-3-min rush).
    this.holdUntil = Math.min(125, Math.max(70, 100 / effAggression));
    // Seed the tactical PRNG deterministically (difficulty + personality + cap) so each matchup
    // varies but stays reproducible across save/load.
    this.rng = this.seedRng();
  }

  /** Dynamic state for save/load (the personality + difficulty mods are re-derived on construction).
   *  Tactical fields default-fill on restore so a partial/older snapshot still loads cleanly. */
  serialize(): AISnapshot {
    return {
      think: this.think, waveSize: this.waveSize, holdUntil: this.holdUntil, attacking: this.attacking,
      phase: this.phase, phaseUntil: this.phaseUntil, rallyX: this.rallyX, rallyY: this.rallyY,
      rng: this.rng, lastTargetId: this.lastTargetId,
    };
  }

  restore(s: AISnapshot): void {
    this.think = s.think; this.waveSize = s.waveSize; this.holdUntil = s.holdUntil; this.attacking = s.attacking;
    this.phase = s.phase ?? (s.attacking ? 'assault' : 'massing');
    this.phaseUntil = s.phaseUntil ?? 0;
    this.rallyX = s.rallyX ?? 0; this.rallyY = s.rallyY ?? 0;
    this.rng = (s.rng ?? this.seedRng()) >>> 0;
    this.lastTargetId = s.lastTargetId ?? 0;
  }

  update(dt: number): void {
    if (this.world.result !== 'playing') return;
    this.think -= dt;
    if (this.think > 0) return;
    this.think = this.mods.thinkInterval;

    if (this.world.enemy.ready) this.placeReady();
    else if (!this.world.enemy.building) this.buildNext();

    this.train();
    if (this.world.time >= this.holdUntil) this.commandArmy();
  }

  private count(id: string): number {
    return this.world.buildings.filter((b) => b.owner === 'enemy' && b.def.id === id).length;
  }

  private buildNext(): void {
    for (const step of this.p.buildOrder) {
      if (this.count(step.id) >= step.min) continue;
      if (this.world.canStartBuilding('enemy', step.id)) {
        this.world.startBuilding('enemy', step.id);
      }
      return; // wait for this step before moving on
    }
  }

  private placeReady(): void {
    const def = BUILDINGS[this.world.enemy.ready!];
    const base = this.baseCenterTile();
    // spiral outward from the base centre looking for a legal spot
    for (let r = 1; r < 18; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = base.tx + dx, ty = base.ty + dy;
          if (this.world.canPlace('enemy', def, tx, ty)) {
            this.world.placeReady('enemy', tx, ty);
            return;
          }
        }
      }
    }
  }

  private baseCenterTile(): { tx: number; ty: number } {
    const own = this.world.buildings.filter((b) => b.owner === 'enemy');
    if (own.length === 0) return { tx: 32, ty: 32 };
    let sx = 0, sy = 0;
    for (const b of own) { sx += b.tx + b.def.w / 2; sy += b.ty + b.def.h / 2; }
    return { tx: Math.round(sx / own.length), ty: Math.round(sy / own.length) };
  }

  private train(): void {
    const owned = this.world.ownedTypes('enemy');
    const floor = this.mods.trainCreditFloor;
    const credits = this.world.enemy.credits;
    const harvesters = this.world.units.filter(
      (u) => u.owner === 'enemy' && u.def.harvester).length;
    if (owned.has('factory') && harvesters < this.p.harvesterTarget) {
      this.world.queueUnit('enemy', 'harvester');
      return;
    }

    // Spend any healthy surplus on tech before massing more bodies (kept high so teching never
    // starves the army of units).
    this.buyUpgrades();

    // Cap the standing army at ~waveCap so the AI commits in waves instead of hoarding a
    // steamroll blob; this is the lever that keeps games competitive rather than overrun.
    // Count in-flight queued combat units too, else the AI over-queues between spawns and the
    // army balloons far past the cap (the M2/M3 30-unit blobs that broke difficulty scaling).
    const army = this.world.units.filter((u) => u.owner === 'enemy' && u.def.weapon).length;
    let queuedArmed = 0;
    for (const q of this.world.enemy.unitQueues.values()) {
      for (const it of q) if (UNITS[it.defId]?.weapon) queuedArmed++;
    }
    if (army + queuedArmed >= this.waveCap + 2) return;
    // Keep building its base before flooding cheap infantry: hold a reserve until the tech /
    // economy backbone exists, so the AI doesn't dump all its starting credits into a turn-1
    // infantry rush that overruns the player before they can stand up a defence.
    const hasEconomy = this.count('refinery') >= 2 || owned.has('factory');
    const infReserve = hasEconomy ? this.p.infReserveEco : this.p.infReservePre;
    // Vehicles: mostly Battle Tanks, with a couple of early Recon Buggies for pressure/recon.
    if (owned.has('factory')) {
      if (this.unitCount('scout') < 2 && this.unitCount('tank') === 0 && credits > 450 * floor) {
        this.world.queueUnit('enemy', 'scout');
      } else if (this.unitCount('artillery') < Math.round(this.p.siegeTarget * this.mods.siegeMult)
                 && this.unitCount('tank') >= 2 && credits > 600 * floor) {
        // Siege to crack the player's turret wall — outranges turrets (230 vs 170) with splash.
        // Gated on a tank frontline first so the fragile Artillery isn't fielded naked. The count
        // scales with difficulty (siegeMult) — the main turtle-breaking difficulty ramp lever.
        this.world.queueUnit('enemy', 'artillery');
      } else if (credits > 600 * floor) {
        this.world.queueUnit('enemy', 'tank');
      }
    }
    // Infantry: blend riflemen with Rocket Troopers (anti-armour, and the AI's only anti-air),
    // mixed per the personality's rocketRatio so the army can answer tanks and Ornithopters.
    if (owned.has('barracks') && credits > infReserve * floor) {
      const wantRocket = this.unitCount('rocket') < this.unitCount('infantry') * this.p.rocketRatio;
      this.world.queueUnit('enemy', wantRocket ? 'rocket' : 'infantry');
    }
    if (owned.has('helipad') && credits > 800 * floor) {
      this.world.queueUnit('enemy', 'aircraft');
    }
  }

  private unitCount(id: string): number {
    return this.world.units.filter((u) => u.owner === 'enemy' && u.def.id === id).length;
  }

  /** Sink a large surplus into a single damage upgrade once the Radar is up. Kept deliberately
   *  light (one upgrade, high threshold) so the AI never snowballs out of the difficulty band. */
  private buyUpgrades(): void {
    if (!this.world.ownedTypes('enemy').has('radar')) return;
    if (this.world.enemy.credits > this.p.upgradeThreshold
        && this.world.canPurchaseUpgrade('enemy', 'depleted_rounds')) {
      this.world.purchaseUpgrade('enemy', 'depleted_rounds');
    }
  }

  // ===== Tactical PRNG (deterministic; state is serialized) ==================================
  // mulberry32: tiny and fully reproducible. The ONLY entropy in the AI — consumed at phase
  // transitions / target changes (never inside order-unstable loops), so a save resumes the exact
  // stream. Seeded from difficulty + personality + cap so each matchup plays out differently.
  private seedRng(): number {
    let h = 2166136261 >>> 0;
    const s = this.world.difficulty + '|' + this.p.id + '|' + this.waveCap;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) || 1;
  }
  private nextRand(): number {
    let t = (this.rng = (this.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  private chance(p: number): boolean { return this.nextRand() < p; }
  private jitter(span: number): number { return (this.nextRand() * 2 - 1) * span; }

  // ===== Army tactics ========================================================================
  // A deterministic state machine — massing -> probe -> assault -> regroup — driving the EXISTING
  // command substrate (attack-move, focus-fire, stances, the built-in artillery kite). Replaces
  // the old "a-move the whole blob at the nearest building", which fed the army straight into the
  // player's turret kill-zone (the documented inverted-aggression bug).
  private enemyArmy(): Unit[] {
    return this.world.units.filter((u) => u.owner === 'enemy' && u.def.weapon && u.alive);
  }

  /** Achievable commit size: a fraction of the (capped) army, NOT a runaway wave counter — so the
   *  AI always re-commits after rebuilding instead of stalling into a 540s draw. */
  private commitThreshold(): number {
    return Math.max(4, Math.round(this.waveCap * COMMIT_FRAC));
  }

  private commandArmy(): void {
    const army = this.enemyArmy();
    if (army.length === 0) { this.phase = 'massing'; this.attacking = false; return; }

    const g = this.roleGroup(army);
    const healthy = (u: Unit) => u.hp / u.maxHp >= RETREAT_HP_FRAC;
    const main = g.line.concat(g.rockets).filter(healthy); // assault body (wounded peel off home)
    const arty = g.arty.filter(healthy);

    // Role layer — runs every tick, in every phase.
    if (g.arty.length) this.world.setStance(g.arty, 'holdground'); // fire at max range, never chase
    this.retreatCheck(army);
    this.runHarassers(g.harassers);

    if (this.phase !== 'assault') {
      // massing / regroup: hold the body on guard near base, keep harassing, and wait for a
      // committing force. A brief seeded dwell (phaseUntil) keeps it from thrashing.
      if (main.length) this.world.setStance(main, 'guard');
      if (army.length >= this.commitThreshold() && this.world.time >= this.phaseUntil) {
        this.enterPhase('assault');
        this.lastTargetId = 0; // force a fresh target + flank waypoint
      }
      this.attacking = false;
      return;
    }

    // ===== assault: committed and CONTINUOUSLY REINFORCED (sustained pressure, not a one-shot blob).
    // Freshly-built units stream to the front each tick, so the AI grinds a defended base down
    // instead of nibbling rebuildable periphery and stalling.
    const target = this.acquireSmartTarget(army);
    if (!target) { this.enterPhase('massing'); this.attacking = false; return; }
    if (main.length) this.world.setStance(main, 'aggressive');
    if (target.id !== this.lastTargetId) {
      const wp = this.flankWaypoint(target); // flank toward the new target (one waypoint -> attack-move)
      this.rallyX = wp.x; this.rallyY = wp.y; this.lastTargetId = target.id;
      if (main.length) this.world.commandAttackMove(main, wp.x, wp.y);
    } else if (main.length && this.lineNear(main, target)) {
      const needFocus = main.some((u) => u.order.kind !== 'attack' || u.order.targetId !== target.id);
      if (needFocus) this.world.commandAttack(main, target); // focus-fire one scored target
    } else {
      const idle = main.filter((u) => u.order.kind === 'idle'); // reinforce: feed arrivals forward
      if (idle.length) this.world.commandAttackMove(idle, target.centerX, target.centerY);
    }
    if (arty.length) {
      // Artillery dismantles the DEFENSIVE wall first (it outranges turrets and takes no return
      // fire), so the main army can break in. Falls back to the main objective if no turrets remain.
      const def = this.nearestPlayerDefense(arty[0].x, arty[0].y) ?? target;
      this.world.commandAttack(arty, def);
    }

    if (army.length <= DISENGAGE_FLOOR) {
      this.enterPhase('regroup'); // spent — pull the survivors home and re-mass
      const home = this.baseCenterTile();
      this.world.commandMove(army, (home.tx + 0.5) * TILE, (home.ty + 0.5) * TILE);
      this.attacking = false;
    } else {
      this.attacking = true;
    }
  }

  private enterPhase(p: ArmyPhase): void {
    this.phase = p;
    this.phaseUntil = this.world.time + 2 + this.nextRand() * 3; // 2-5s seeded dwell (anti-thrash + variety)
  }

  /** Split the army by combat role so each gets the right command. */
  private roleGroup(army: Unit[]): { arty: Unit[]; harassers: Unit[]; rockets: Unit[]; line: Unit[] } {
    const arty: Unit[] = [], harassers: Unit[] = [], rockets: Unit[] = [], line: Unit[] = [];
    for (const u of army) {
      const w = u.def.weapon!;
      if (w.minRange) arty.push(u);                     // artillery: stand off behind the line
      else if (u.def.id === 'scout') harassers.push(u); // buggies: harass economy then flee
      else if (w.type === 'rocket') rockets.push(u);    // anti-armour / anti-air
      else line.push(u);                                // tanks + riflemen: main line
    }
    return { arty, harassers, rockets, line };
  }

  /** Pull any wounded unit back to base — issued once (guarded on order + distance, no spam). */
  private retreatCheck(army: Unit[]): void {
    const home = this.baseCenterTile();
    const hx = (home.tx + 0.5) * TILE, hy = (home.ty + 0.5) * TILE;
    for (const u of army) {
      if (u.hp / u.maxHp >= RETREAT_HP_FRAC) continue;
      if (u.order.kind !== 'move' && Math.hypot(u.x - hx, u.y - hy) > 4 * TILE) {
        this.world.commandMove([u], hx, hy);
      }
    }
  }

  /** Fast skirmishers poke the player's economy; wounded ones are pulled home by retreatCheck. */
  private runHarassers(hs: Unit[]): void {
    if (!hs.length) return;
    const eco = this.bestEconomyTarget();
    if (!eco) return;
    for (const u of hs) {
      if (u.hp / u.maxHp < 0.5) continue;
      if (u.order.kind === 'idle') this.world.commandAttackMove([u], eco.x, eco.y);
    }
  }

  /** Deterministic target scoring: value (economy/production high, turrets low) minus local
   *  threat, so the army focus-fires a soft, reachable target instead of feeding the turret line. */
  private acquireSmartTarget(army: Unit[]): Building | null {
    let cx = 0, cy = 0;
    for (const u of army) { cx += u.x; cy += u.y; }
    cx /= army.length; cy /= army.length;
    // Threat-aversion shrinks as the army grows: a big force commits to the high-value core even
    // through defenses (so it actually RAZES the base instead of nibbling rebuildable periphery
    // forever), while a small/whittled force prefers soft, reachable targets and avoids kill-zones.
    const aversion = clamp(9 / army.length, 0.3, 2.2);
    let best: Building | null = null, bestScore = -Infinity, bestId = Infinity;
    for (const b of this.world.buildings) {
      if (b.owner !== 'player' || !b.alive) continue;
      let s = this.targetValue(b.def.id);
      s -= 0.012 * Math.hypot(b.centerX - cx, b.centerY - cy) / TILE; // mild nearness preference
      s -= aversion * this.localThreat(b.centerX, b.centerY);         // avoid the kill-zone when weak
      if (s > bestScore || (s === bestScore && b.id < bestId)) { bestScore = s; bestId = b.id; best = b; }
    }
    return best; // always returns SOME target if the player has a base -> never stalemates
  }

  private targetValue(id: string): number {
    switch (id) {
      case 'yard': return 6;             // razing it stops the player rebuilding anything (decapitation)
      case 'refinery': case 'factory': return 6;
      case 'power': return 5;            // powering down cripples the turret line
      case 'barracks': case 'radar': case 'helipad': return 4;
      case 'turret': case 'rocketturret': return 1;
      default: return 2;
    }
  }

  /** Defensive firepower near a point (player turrets + nearby army) — subtracted from target score. */
  private localThreat(x: number, y: number): number {
    let t = 0;
    for (const b of this.world.buildings) {
      if (b.owner === 'player' && b.alive && b.def.weapon
          && Math.hypot(b.centerX - x, b.centerY - y) < b.def.weapon.range + 2 * TILE) t += 3;
    }
    for (const u of this.world.units) {
      if (u.owner === 'player' && u.alive && u.def.weapon
          && Math.hypot(u.x - x, u.y - y) < 6 * TILE) t += 0.5;
    }
    return t;
  }

  /** Nearest player turret / defensive structure to a point — artillery's priority target, so the
   *  AI dismantles the wall from beyond turret range rather than feeding the main army into it. */
  private nearestPlayerDefense(x: number, y: number): Building | null {
    let best: Building | null = null, bestD = Infinity, bestId = Infinity;
    for (const b of this.world.buildings) {
      if (b.owner !== 'player' || !b.alive || !b.def.weapon) continue;
      const d = Math.hypot(b.centerX - x, b.centerY - y);
      if (d < bestD || (d === bestD && b.id < bestId)) { bestD = d; bestId = b.id; best = b; }
    }
    return best;
  }

  private playerTurretCentroid(): { x: number; y: number } | null {
    let sx = 0, sy = 0, n = 0;
    for (const b of this.world.buildings) {
      if (b.owner === 'player' && b.alive && b.def.weapon) { sx += b.centerX; sy += b.centerY; n++; }
    }
    return n ? { x: sx / n, y: sy / n } : null;
  }

  /** A single approach waypoint offset to the flank away from the player's turret mass (with a
   *  seeded side flip for unpredictability). One waypoint -> commandAttackMove, so no AI-side A*. */
  private flankWaypoint(target: Building): { x: number; y: number } {
    const base = this.baseCenterTile();
    const bx = (base.tx + 0.5) * TILE, by = (base.ty + 0.5) * TILE;
    const ax = target.centerX - bx, ay = target.centerY - by;
    const len = Math.hypot(ax, ay) || 1;
    const px = -ay / len, py = ax / len; // unit perpendicular to the base->target axis
    let side = 1;
    const pc = this.playerTurretCentroid();
    if (pc) side = (pc.x - target.centerX) * px + (pc.y - target.centerY) * py > 0 ? -1 : 1;
    if (this.chance(0.25)) side = -side; // seeded flank-side jitter
    const offX = px * side * FLANK_OFFSET_TILES * TILE, offY = py * side * FLANK_OFFSET_TILES * TILE;
    return {
      x: target.centerX + offX - (ax / len) * 2 * TILE + this.jitter(1.5 * TILE),
      y: target.centerY + offY - (ay / len) * 2 * TILE + this.jitter(1.5 * TILE),
    };
  }

  /** Nearest player harvester (economy denial), else nearest refinery. */
  private bestEconomyTarget(): { x: number; y: number } | null {
    const base = this.baseCenterTile();
    const bx = (base.tx + 0.5) * TILE, by = (base.ty + 0.5) * TILE;
    let best: { x: number; y: number } | null = null, bestD = Infinity, bestId = Infinity;
    for (const u of this.world.units) {
      if (u.owner !== 'player' || !u.def.harvester || !u.alive) continue;
      const d = Math.hypot(u.x - bx, u.y - by);
      if (d < bestD || (d === bestD && u.id < bestId)) { bestD = d; bestId = u.id; best = { x: u.x, y: u.y }; }
    }
    if (best) return best;
    for (const b of this.world.buildings) {
      if (b.owner !== 'player' || !b.alive || b.def.id !== 'refinery') continue;
      const d = Math.hypot(b.centerX - bx, b.centerY - by);
      if (d < bestD) { bestD = d; best = { x: b.centerX, y: b.centerY }; }
    }
    return best;
  }

  private lineNear(units: Unit[], target: Building): boolean {
    for (const u of units) {
      if (Math.hypot(u.x - target.centerX, u.y - target.centerY) < u.def.weapon!.range + 3 * TILE) return true;
    }
    return false;
  }
}
