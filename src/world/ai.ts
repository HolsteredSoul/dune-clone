// A pragmatic skirmish AI for the enemy faction. On a think interval it: places any finished
// building, starts the next structure in its build order, trains harvesters/army, and once it
// has a wave, marches the whole army at the player's nearest building.

import { BUILDINGS, UNITS, DIFFICULTY } from './defs';
import type { DifficultyMods } from './defs';
import { TILE } from './constants';
import type { World } from './world';
import type { Building } from './building';

interface BuildStep { id: string; min: number; }

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

export class EnemyAI {
  private think = 1;
  private waveSize = 4;
  private holdUntil: number;        // sim time before which the AI won't launch its first wave
  private readonly mods: DifficultyMods;

  constructor(private readonly world: World, aggression = 1) {
    this.mods = DIFFICULTY[world.difficulty];
    const effAggression = aggression * this.mods.aggressionMult;
    // First-wave size as a fraction of the wave cap, nudged by aggression. Kept small so the
    // opening wave is a probe, not a knockout: the game is decided over several exchanges
    // rather than one decisive ~30s blob. Subsequent waves grow toward the cap in commandArmy().
    const frac = Math.min(0.6, 0.34 + 0.14 * effAggression);
    this.waveSize = Math.max(4, Math.round(this.mods.waveCap * frac));
    // Hold the opening army back for a grace period so a pre-placed standing army (M2/M3)
    // doesn't insta-rush at t=0; the grace shrinks with aggression so harder missions hit
    // sooner. The FLOOR is the anti-stomp guard: even the most aggressive mission/difficulty
    // grants the player time to stand up a defence before the first wave (no <90s stomps, and
    // it keeps match length in the target band rather than ending in a sub-3-min rush).
    this.holdUntil = Math.min(125, Math.max(70, 100 / effAggression));
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
    for (const step of BUILD_ORDER) {
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
    if (owned.has('factory') && harvesters < 2) {
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
    if (army + queuedArmed >= this.mods.waveCap + 2) return;
    // Keep building its base before flooding cheap infantry: hold a reserve until the tech /
    // economy backbone exists, so the AI doesn't dump all its starting credits into a turn-1
    // infantry rush that overruns the player before they can stand up a defence.
    const hasEconomy = this.count('refinery') >= 2 || owned.has('factory');
    const infReserve = hasEconomy ? 250 : 700;
    // Vehicles: mostly Battle Tanks, with a couple of early Recon Buggies for pressure/recon.
    if (owned.has('factory')) {
      if (this.unitCount('scout') < 2 && this.unitCount('tank') === 0 && credits > 450 * floor) {
        this.world.queueUnit('enemy', 'scout');
      } else if (credits > 600 * floor) {
        this.world.queueUnit('enemy', 'tank');
      }
    }
    // Infantry: blend riflemen with Rocket Troopers (anti-armour, and the AI's only anti-air),
    // roughly one rocket per two riflemen so the army can answer tanks and Ornithopters.
    if (owned.has('barracks') && credits > infReserve * floor) {
      const wantRocket = this.unitCount('rocket') < this.unitCount('infantry') * 0.5;
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
    if (this.world.enemy.credits > 1500
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
    this.waveSize = Math.min(this.mods.waveCap, this.waveSize + 1);
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
