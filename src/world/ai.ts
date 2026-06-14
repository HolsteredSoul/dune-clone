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
}

export const PERSONALITIES: Record<string, AIPersonality> = {
  balanced:   { id: 'balanced',   name: 'Balanced',   blurb: 'Well-rounded — steady economy, mixed army.',    buildOrder: BUILD_ORDER, aggressionMult: 1.0,  waveCapMult: 1.0,  rocketRatio: 0.5,  infReserveEco: 250, infReservePre: 700, upgradeThreshold: 1500, harvesterTarget: 2 },
  turtle:     { id: 'turtle',     name: 'Turtle',     blurb: 'Walls up with turrets, strikes late but bigger.', buildOrder: TURTLE_ORDER, aggressionMult: 0.85, waveCapMult: 1.15, rocketRatio: 0.6,  infReserveEco: 300, infReservePre: 700, upgradeThreshold: 1300, harvesterTarget: 2 },
  rusher:     { id: 'rusher',     name: 'Rusher',     blurb: 'Floods cheap infantry and commits early.',        buildOrder: RUSH_ORDER,   aggressionMult: 1.35, waveCapMult: 0.9,  rocketRatio: 0.35, infReserveEco: 150, infReservePre: 450, upgradeThreshold: 2200, harvesterTarget: 2 },
  mechanized: { id: 'mechanized', name: 'Mechanized', blurb: 'Factory-first, tank-heavy pushes.',                buildOrder: MECH_ORDER,   aggressionMult: 0.95, waveCapMult: 1.0,  rocketRatio: 0.4,  infReserveEco: 400, infReservePre: 800, upgradeThreshold: 1400, harvesterTarget: 2 },
  economist:  { id: 'economist',  name: 'Economist',  blurb: 'Booms the economy, late oversized army.',          buildOrder: ECON_ORDER,   aggressionMult: 0.85, waveCapMult: 1.2,  rocketRatio: 0.5,  infReserveEco: 300, infReservePre: 800, upgradeThreshold: 1200, harvesterTarget: 3 },
};

/** Display order for the skirmish AI-personality picker (balanced first = the safe default). */
export const PERSONALITY_ORDER: string[] = ['balanced', 'rusher', 'turtle', 'mechanized', 'economist'];

export class EnemyAI {
  private think = 1;
  private waveSize = 4;
  private readonly waveCap: number; // personality-scaled army cap (was mods.waveCap)
  private holdUntil: number;        // sim time before which the AI won't launch its first wave
  private readonly mods: DifficultyMods;
  private readonly p: AIPersonality;

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
  }

  /** Dynamic state for save/load (the personality + difficulty mods are re-derived on construction). */
  serialize(): { think: number; waveSize: number; holdUntil: number; attacking: boolean } {
    return { think: this.think, waveSize: this.waveSize, holdUntil: this.holdUntil, attacking: this.attacking };
  }

  restore(s: { think: number; waveSize: number; holdUntil: number; attacking: boolean }): void {
    this.think = s.think; this.waveSize = s.waveSize; this.holdUntil = s.holdUntil; this.attacking = s.attacking;
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

  private attacking = false;

  private commandArmy(): void {
    const army = this.world.units.filter((u) => u.owner === 'enemy' && u.def.weapon);
    // Abort a push that's been whittled down to a remnant; pull survivors home to defend and
    // re-mass. Stops the AI from feeding its army piecemeal into the player's turret line,
    // which (left unchecked) inverted the difficulty — aggressive AIs threw their army away.
    if (this.attacking && army.length <= Math.max(2, Math.floor(this.waveSize / 3))) {
      this.attacking = false;
      const home = this.baseCenterTile();
      for (const u of army) {
        if (u.order.kind === 'attack') {
          this.world.commandMove([u], (home.tx + 0.5) * TILE, (home.ty + 0.5) * TILE);
        }
      }
      return;
    }
    if (army.length < this.waveSize && !this.attacking) return;

    const target = this.nearestPlayerBuilding();
    if (!target) return;
    this.attacking = true;
    for (const u of army) {
      // redirect units that are idle, moving home, or already attacking (don't yank mid-engage)
      if (u.order.kind === 'idle' || u.order.kind === 'attack' || u.order.kind === 'move') {
        this.world.commandAttack([u], target);
      }
    }
    this.waveSize = Math.min(this.waveCap, this.waveSize + 1);
  }

  private nearestPlayerBuilding(): Building | null {
    const base = this.baseCenterTile();
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.world.buildings) {
      if (b.owner !== 'player') continue;
      const d = Math.hypot(b.tx - base.tx, b.ty - base.ty);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }
}
