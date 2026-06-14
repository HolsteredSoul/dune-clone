// Headless balance harness. Drives BOTH factions with scripted bots (the real EnemyAI for the
// enemy; a mirror-style PlayerBot for the player), steps the pure-sim World at a fixed rate to
// completion, and prints win/duration/army stats per difficulty. No DOM — imports pure-sim only.
//
// Run via: npm run sim   (esbuild bundles this to scripts/sim.mjs, then node runs it)

import { World } from '../src/world/world';
import { EnemyAI } from '../src/world/ai';
import { MISSIONS } from '../src/game/missions';
import { BUILDINGS } from '../src/world/defs';
import { TILE } from '../src/world/constants';
import type { Difficulty } from '../src/world/defs';
import type { Building } from '../src/world/building';

// ---- Scripted PLAYER bot ------------------------------------------------------------------
// Mirrors EnemyAI: on a think interval it places ready buildings (spiraling from the yard),
// starts the next structure in a defensive-then-teching build order, keeps 2-3 harvesters,
// streams infantry, techs to tanks, and attack-moves the army at the enemy once it's big enough.

interface BuildStep { id: string; min: number; }

// Defensive opening (turret early, now that turret.requires === 'power'), then tech to factory.
const PLAYER_BUILD_ORDER: BuildStep[] = [
  { id: 'power', min: 1 },
  { id: 'refinery', min: 1 },
  { id: 'turret', min: 1 },
  { id: 'barracks', min: 1 },
  { id: 'power', min: 2 },
  { id: 'turret', min: 2 },
  { id: 'radar', min: 1 },
  { id: 'factory', min: 1 },
  { id: 'refinery', min: 2 },
  { id: 'power', min: 3 },
  { id: 'turret', min: 3 },
];

class PlayerBot {
  private think = 0.5;
  private interval = 1.4;
  private waveSize = 12;      // mass this many before committing the first push
  private attacking = false;
  private regroupAt = 5;      // if the committed army is whittled below this, pull back & remass

  constructor(private readonly world: World) {}

  update(dt: number): void {
    if (this.world.result !== 'playing') return;
    this.think -= dt;
    if (this.think > 0) return;
    this.think = this.interval;

    if (this.world.player.ready) this.placeReady();
    else if (!this.world.player.building) this.buildNext();

    this.train();
    this.commandArmy();
  }

  private count(id: string): number {
    return this.world.buildings.filter((b) => b.owner === 'player' && b.def.id === id).length;
  }

  private buildNext(): void {
    for (const step of PLAYER_BUILD_ORDER) {
      if (this.count(step.id) >= step.min) continue;
      if (this.world.canStartBuilding('player', step.id)) {
        this.world.startBuilding('player', step.id);
      }
      return; // gate on this step before moving on
    }
  }

  private placeReady(): void {
    const def = BUILDINGS[this.world.player.ready!];
    const base = this.baseCenterTile();
    for (let r = 1; r < 18; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = base.tx + dx, ty = base.ty + dy;
          if (this.world.canPlace('player', def, tx, ty)) {
            this.world.placeReady('player', tx, ty);
            return;
          }
        }
      }
    }
  }

  private baseCenterTile(): { tx: number; ty: number } {
    const own = this.world.buildings.filter((b) => b.owner === 'player');
    if (own.length === 0) return { tx: 8, ty: 49 };
    let sx = 0, sy = 0;
    for (const b of own) { sx += b.tx + b.def.w / 2; sy += b.ty + b.def.h / 2; }
    return { tx: Math.round(sx / own.length), ty: Math.round(sy / own.length) };
  }

  private train(): void {
    const owned = this.world.ownedTypes('player');
    const credits = this.world.player.credits;
    const harvesters = this.world.units.filter(
      (u) => u.owner === 'player' && u.def.harvester).length;
    // Replace lost harvesters up to 3 once a factory exists.
    if (owned.has('factory') && harvesters < 3 && credits > 350) {
      this.world.queueUnit('player', 'harvester');
    }
    // Sink a surplus into upgrades (mirrors a competent human using the Radar tech).
    this.buyUpgrades();
    // Vehicles: tank backbone (the bot blobs a-move, so fragile Artillery it can't micro only
    // weakens it — keep the composition to what a naive-but-decent player fields well).
    if (owned.has('factory') && credits > 700) {
      this.world.queueUnit('player', 'tank');
    }
    if (owned.has('barracks') && credits > 200) {
      const wantRocket = this.unitCount('rocket') < this.unitCount('infantry') * 0.5;
      this.world.queueUnit('player', wantRocket ? 'rocket' : 'infantry');
    }
  }

  private unitCount(id: string): number {
    return this.world.units.filter((u) => u.owner === 'player' && u.def.id === id).length;
  }

  private buyUpgrades(): void {
    if (!this.world.ownedTypes('player').has('radar')) return;
    const c = this.world.player.credits;
    if (c > 1200 && this.world.canPurchaseUpgrade('player', 'depleted_rounds')) {
      this.world.purchaseUpgrade('player', 'depleted_rounds');
    } else if (c > 1400 && this.world.canPurchaseUpgrade('player', 'composite_armor')) {
      this.world.purchaseUpgrade('player', 'composite_armor');
    }
  }

  private commandArmy(): void {
    const army = this.world.units.filter((u) => u.owner === 'player' && u.def.weapon);
    // Pull back to re-mass if a push got whittled down (don't feed units piecemeal).
    if (this.attacking && army.length <= this.regroupAt) {
      this.attacking = false;
      const home = this.baseCenterTile();
      this.world.commandMove(army, (home.tx + 0.5) * TILE, (home.ty + 0.5) * TILE);
      return;
    }
    if (army.length < this.waveSize && !this.attacking) return;

    const target = this.nearestEnemyBuilding();
    if (!target) return;
    this.attacking = true;
    for (const u of army) {
      if (u.order.kind === 'idle' || u.order.kind === 'attack' || u.order.kind === 'move') {
        this.world.commandAttack([u], target);
      }
    }
  }

  private nearestEnemyBuilding(): Building | null {
    const base = this.baseCenterTile();
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.world.buildings) {
      if (b.owner !== 'enemy') continue;
      const d = Math.hypot(b.tx - base.tx, b.ty - base.ty);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }
}

// A passive/careless player: builds economy only (power + refineries), never defends or trains.
class PassiveBot {
  private think = 0.5;
  private interval = 1.4;
  private order: BuildStep[] = [
    { id: 'power', min: 1 },
    { id: 'refinery', min: 2 },
    { id: 'power', min: 2 },
  ];
  constructor(private readonly world: World) {}
  update(dt: number): void {
    if (this.world.result !== 'playing') return;
    this.think -= dt;
    if (this.think > 0) return;
    this.think = this.interval;
    if (this.world.player.ready) { this.placeReady(); return; }
    if (this.world.player.building) return;
    for (const step of this.order) {
      const have = this.world.buildings.filter(
        (b) => b.owner === 'player' && b.def.id === step.id).length;
      if (have >= step.min) continue;
      if (this.world.canStartBuilding('player', step.id)) this.world.startBuilding('player', step.id);
      return;
    }
  }
  private placeReady(): void {
    const def = BUILDINGS[this.world.player.ready!];
    const own = this.world.buildings.filter((b) => b.owner === 'player');
    let sx = 0, sy = 0;
    for (const b of own) { sx += b.tx + b.def.w / 2; sy += b.ty + b.def.h / 2; }
    const cx = Math.round(sx / own.length), cy = Math.round(sy / own.length);
    for (let r = 1; r < 18; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (this.world.canPlace('player', def, cx + dx, cy + dy)) {
            this.world.placeReady('player', cx + dx, cy + dy);
            return;
          }
        }
      }
    }
  }
}

// ---- match runner -------------------------------------------------------------------------

interface MatchResult {
  result: 'won' | 'lost' | 'playing';
  duration: number;
  firstBuildingLoss: number;   // t of first building destroyed on either side (Infinity if none)
  firstWave: number;           // t the enemy army first reaches/attacks the player base
  peakEnemyArmy: number;
  playerBuildings: number;
  enemyBuildings: number;
  playerArmy: number;
  enemyArmy: number;
  peakPlayerCredits: number;
  playerCreditsAt60: number;
}

const DT = 1 / 30;            // sim step (coarser than 60 Hz to run many matches fast)
const MAX_T = 540;           // 9 min hard cap (draw beyond the target 3-8 min band)

function runMatch(missionIdx: number, difficulty: Difficulty, passive = false): MatchResult {
  const world = new World(MISSIONS[missionIdx], difficulty);
  const ai = new EnemyAI(world, MISSIONS[missionIdx].aggression, MISSIONS[missionIdx].aiPersonality);
  const bot: { update(dt: number): void } = passive ? new PassiveBot(world) : new PlayerBot(world);

  let firstBuildingLoss = Infinity;
  let prevPlayerB = world.buildings.filter((b) => b.owner === 'player').length;
  let prevEnemyB = world.buildings.filter((b) => b.owner === 'enemy').length;
  let firstWave = Infinity;
  let peakEnemyArmy = 0;
  let peakPlayerCredits = 0;
  let playerCreditsAt60 = 0;

  // player base centre (for wave-arrival detection)
  const pb = world.buildings.filter((b) => b.owner === 'player');
  let bx = 0, by = 0;
  for (const b of pb) { bx += b.centerX; by += b.centerY; }
  bx /= pb.length; by /= pb.length;

  while (world.result === 'playing' && world.time < MAX_T) {
    world.update(DT);
    ai.update(DT);
    bot.update(DT);

    const pB = world.buildings.filter((b) => b.owner === 'player').length;
    const eB = world.buildings.filter((b) => b.owner === 'enemy').length;
    if ((pB < prevPlayerB || eB < prevEnemyB) && firstBuildingLoss === Infinity) {
      firstBuildingLoss = world.time;
    }
    prevPlayerB = pB; prevEnemyB = eB;

    const enemyArmy = world.units.filter((u) => u.owner === 'enemy' && u.def.weapon);
    if (enemyArmy.length > peakEnemyArmy) peakEnemyArmy = enemyArmy.length;
    // first enemy combatant to come within ~10 tiles of the player base
    if (firstWave === Infinity) {
      for (const u of enemyArmy) {
        if (Math.hypot(u.x - bx, u.y - by) < 10 * TILE) { firstWave = world.time; break; }
      }
    }
    if (world.player.credits > peakPlayerCredits) peakPlayerCredits = world.player.credits;
    if (playerCreditsAt60 === 0 && world.time >= 60) playerCreditsAt60 = world.player.credits;
  }

  return {
    result: world.result,
    duration: world.time,
    firstBuildingLoss,
    firstWave,
    peakEnemyArmy,
    playerBuildings: world.buildings.filter((b) => b.owner === 'player').length,
    enemyBuildings: world.buildings.filter((b) => b.owner === 'enemy').length,
    playerArmy: world.units.filter((u) => u.owner === 'player' && u.def.weapon).length,
    enemyArmy: world.units.filter((u) => u.owner === 'enemy' && u.def.weapon).length,
    peakPlayerCredits,
    playerCreditsAt60,
  };
}

// ---- economy isolation probe (no combat: run player bot vs a do-nothing enemy) -------------

function probeEconomy(): { rate: number; at60: number; peak: number } {
  // Use mission 1 but neutralise the enemy by never ticking its AI; measure player income.
  const world = new World(MISSIONS[0], 'normal');
  const bot = new PlayerBot(world);
  let at60 = 0;
  let credits30 = 0, credits90 = 0;
  while (world.result === 'playing' && world.time < 120) {
    world.update(DT);
    bot.update(DT);
    if (at60 === 0 && world.time >= 60) at60 = world.player.credits;
    if (credits30 === 0 && world.time >= 30) credits30 = world.player.credits;
    if (credits90 === 0 && world.time >= 90) credits90 = world.player.credits;
  }
  return { rate: (credits90 - credits30) / 60, at60, peak: world.player.credits };
}

// ---- driver -------------------------------------------------------------------------------

function pct(n: number): string { return (n * 100).toFixed(0) + '%'; }
function avg(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const RUNS = Number(process.env.RUNS ?? 20);
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const log = (s: string) => process.stderr.write(s + '\n'); // unbuffered progress

console.log('=== ECONOMY PROBE (player bot, mission 1, normal) ===');
const econ = Array.from({ length: 8 }, () => probeEconomy());
console.log(`  income rate (30->90s): ${avg(econ.map((e) => e.rate)).toFixed(0)} cr/s`);
console.log(`  credits @60s: ${avg(econ.map((e) => e.at60)).toFixed(0)}  peak: ${avg(econ.map((e) => e.peak)).toFixed(0)}`);
console.log('');

for (const diff of DIFFS) {
  console.log(`========== DIFFICULTY: ${diff.toUpperCase()} ==========`);
  for (let m = 0; m < MISSIONS.length; m++) {
    log(`  running ${diff} mission ${m + 1} (${RUNS} runs)...`);
    const results: MatchResult[] = [];
    for (let r = 0; r < RUNS; r++) results.push(runMatch(m, diff));
    const wins = results.filter((r) => r.result === 'won').length;
    const losses = results.filter((r) => r.result === 'lost').length;
    const draws = results.filter((r) => r.result === 'playing').length;
    const durations = results.map((r) => r.duration);
    const flb = results.map((r) => r.firstBuildingLoss).filter((t) => isFinite(t));
    const fw = results.map((r) => r.firstWave).filter((t) => isFinite(t));
    const peakArmy = results.map((r) => r.peakEnemyArmy);
    console.log(`  Mission ${m + 1}:  win ${pct(wins / RUNS)}  loss ${pct(losses / RUNS)}  draw ${pct(draws / RUNS)}`);
    console.log(`    duration: med ${median(durations).toFixed(0)}s  min ${Math.min(...durations).toFixed(0)}s  max ${Math.max(...durations).toFixed(0)}s`);
    console.log(`    1st building loss: med ${flb.length ? median(flb).toFixed(0) : '∞'}s  min ${flb.length ? Math.min(...flb).toFixed(0) : '∞'}s`);
    console.log(`    1st wave @base: ${fw.length ? median(fw).toFixed(0) : '∞'}s   peak enemy army: ${avg(peakArmy).toFixed(1)}`);
  }
  console.log('');
}

// Passive player should lose on Normal Mission 1 (validates "lose if careless").
console.log('=== PASSIVE PLAYER (mission 1, normal) ===');
const passive = Array.from({ length: RUNS }, () => runMatch(0, 'normal', true));
const passiveLosses = passive.filter((r) => r.result === 'lost').length;
console.log(`  loss rate: ${pct(passiveLosses / RUNS)}  med duration ${median(passive.map((r) => r.duration)).toFixed(0)}s`);
