// Headless sandworm behaviour check. Drives a real World (enemy AI on, player harvesters
// auto-harvesting) and asserts the worm actually hunts, surfaces, eats, and is driven off; then
// proves save/load + lockstep determinism with worms in the snapshot (serialize → deserialize into
// a fresh World → both tick 600 more steps → identical hashes).
//
// Run via: npx esbuild scripts/worm-check.ts --bundle --platform=node --format=esm
//          --outfile=scripts/worm-check.mjs && node scripts/worm-check.mjs

import { World } from '../src/world/world';
import { EnemyAI } from '../src/world/ai';
import { MISSIONS, makeSkirmishConfig } from '../src/game/missions';
import { UNITS } from '../src/world/defs';
import { Unit } from '../src/world/unit';
import { TILE, WORM_REPEL_DAMAGE } from '../src/world/constants';
import { Terrain } from '../src/world/tilemap';
import { hashWorld } from '../src/net/commands';
import type { Worm } from '../src/world/worm';

const DT = 1 / 30;
let failures = 0;
function check(cond: boolean, msg: string): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
}

// ---- 1. Behaviour: hunt → surface → bite over a long AI-vs-passive match ------------------
{
  const config = MISSIONS[0];
  const world = new World(config, 'normal');
  const ai = new EnemyAI(world, config.aggression, config.aiPersonality);
  check(world.worms.length === 1, `mission 1 spawns 1 worm (got ${world.worms.length})`);
  const w = world.worms[0];
  const onSand = world.map.terrain[world.map.idx(Math.floor(w.x / TILE), Math.floor(w.y / TILE))] !== Terrain.Rock;
  check(onSand, 'worm spawned on sand/spice');
  let minBuildingDist = Infinity;
  for (const b of world.buildings) {
    minBuildingDist = Math.min(minBuildingDist, Math.hypot(b.centerX - w.x, b.centerY - w.y));
  }
  check(minBuildingDist >= 10 * TILE, `worm spawned ≥10 tiles from buildings (${(minBuildingDist / TILE).toFixed(1)})`);

  const seen = new Set<string>();
  let meals = 0, hunts = 0, surfacings = 0, fled = 0;
  let prev = w.state;
  let onRock = 0;
  for (let t = 0; t < 420 / DT && world.result === 'playing'; t++) {
    const eatenBefore = w.eaten;
    const hurtBefore = w.hurt;
    world.update(DT);
    ai.update(DT);
    seen.add(w.state);
    if (prev !== 'hunting' && w.state === 'hunting') hunts++;
    if (prev !== 'surfacing' && w.state === 'surfacing') surfacings++;
    if (w.eaten > eatenBefore) meals += w.eaten - eatenBefore;
    if (prev === 'devouring' && w.state === 'submerging' && hurtBefore >= WORM_REPEL_DAMAGE) fled++;
    if (prev === 'surfacing' && w.state === 'submerging' && hurtBefore >= WORM_REPEL_DAMAGE) fled++;
    prev = w.state;
    // The worm must never sit on rock / inside a building footprint.
    const i = world.map.idx(Math.floor(w.x / TILE), Math.floor(w.y / TILE));
    if (world.map.terrain[i] === Terrain.Rock || world.blocked[i]) onRock++;
  }
  console.log(`  states seen: ${[...seen].join(', ')} | hunts ${hunts} surfacings ${surfacings} meals ${meals} (last player loss: ${world.wormVictim || 'none'}) driven-off ${fled} | t=${world.time.toFixed(0)}s result=${world.result}`);
  check(hunts > 0, 'worm hunted at least once');
  check(surfacings > 0, 'worm surfaced at least once');
  check(onRock === 0, `worm never entered rock/footprints (${onRock} ticks)`);
  check(seen.has('roaming'), 'worm roams');
}

// ---- 2. Deterministic bite: a stationary mining harvester on sand gets eaten --------------
{
  const config = makeSkirmishConfig('balanced', false, 3200);
  const world = new World({ ...config, units: [], worms: 1 }, 'normal'); // no other prey
  const w = world.worms[0];
  // Park a lone player harvester on open sand right next to the worm and make the worm hungry.
  const hx = w.x + 3 * TILE, hy = w.y;
  const tx = Math.floor(hx / TILE), ty = Math.floor(hy / TILE);
  // Force open sand under the harvester + on the way, so the read is deterministic (test-only edit).
  for (let dx = 0; dx <= 3; dx++) {
    const i = world.map.idx(Math.floor(w.x / TILE) + dx, ty);
    world.map.terrain[i] = Terrain.Sand; world.blocked[i] = 0;
  }
  const sand = true;
  if (sand) {
    // Reach into the sim through public surface: spawn via config isn't possible post-ctor, so use
    // the units array directly (test-only).
    const h = new Unit(UNITS.harvester, 'player', hx, hy);
    h.order = { kind: 'hold' };            // stationary (STILL_FACTOR applies) but a harvester is loud
    world.units.push(h);
    w.calm = 0; w.think = 0;
    let eaten = false;
    for (let t = 0; t < 30 / DT; t++) {
      world.update(DT);
      if (!h.alive) { eaten = true; break; }
    }
    check(eaten, `parked harvester on sand next to a hungry worm is devoured within 30s (worm state ${w.state}, eaten ${w.eaten})`);
    check(world.wormAlertTime > 0 && world.wormVictim === 'Harvester', `local-faction meal raised the toast alert (${world.wormVictim})`);
  } else {
    console.log('  (skipped bite test: random terrain put rock next to the worm)');
  }
}

// ---- 3. Rock is safe: a unit on a rock tile is never bitten ------------------------------
{
  const config = makeSkirmishConfig('balanced', false, 3200);
  const world = new World({ ...config, worms: 1 }, 'normal');
  const w = world.worms[0];
  // Find a rock tile within 6 tiles of the worm, else stamp one (test-only terrain edit).
  const wtx = Math.floor(w.x / TILE), wty = Math.floor(w.y / TILE);
  const rtx = wtx + 2, rty = wty;
  world.map.terrain[world.map.idx(rtx, rty)] = Terrain.Rock;
  const tank = new Unit(UNITS.tank, 'player', (rtx + 0.5) * TILE, (rty + 0.5) * TILE);
  tank.order = { kind: 'hold' };
  world.units.push(tank);
  w.calm = 0; w.think = 0;
  for (let t = 0; t < 60 / DT; t++) world.update(DT);
  check(tank.alive, `tank parked on Rock survives 60s beside a hungry worm (worm ${w.state}, eaten ${w.eaten})`);
}

// ---- 4. Escort guns drive a surfaced worm under (bite cancelled) --------------------------
{
  const config = makeSkirmishConfig('balanced', false, 3200);
  const world = new World({ ...config, worms: 1 }, 'normal');
  const w = world.worms[0];
  // 4 tanks in a ring at ~4 tiles: one volley (4×38 vs heavy) clears WORM_REPEL_DAMAGE inside the window.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const t = new Unit(UNITS.tank, 'player', w.x + Math.cos(a) * 4 * TILE, w.y + Math.sin(a) * 4 * TILE);
    t.order = { kind: 'hold' };
    world.units.push(t);
  }
  // Force a surfacing right here (test-only state poke).
  (w as Worm).state = 'surfacing'; w.stateT = 1.0; w.hurt = 0;
  let drivenOff = false, maxHurt = 0;
  for (let t = 0; t < 5 / DT; t++) {
    world.update(DT);
    maxHurt = Math.max(maxHurt, w.hurt);
    if (w.state === 'submerging' && w.calm >= 30) { drivenOff = true; break; }
  }
  check(drivenOff, `4 tanks drove the worm off (max hurt ${maxHurt.toFixed(0)} / ${WORM_REPEL_DAMAGE}, state ${w.state}, calm ${w.calm.toFixed(0)})`);
  check(w.eaten === 0, 'no tank was eaten while the worm was being repelled');
}

// ---- 5. Determinism: save/load + lockstep-style hash agreement with worms ----------------
{
  const config = makeSkirmishConfig('balanced', false, 3200);
  const a = new World(config, 'normal');
  const aiA = new EnemyAI(a, config.aggression, config.aiPersonality);
  for (let t = 0; t < 120 / DT; t++) { a.update(DT); aiA.update(DT); }
  const snap = JSON.parse(JSON.stringify(a.serialize()));
  const aiSnap = JSON.parse(JSON.stringify(aiA.serialize()));
  check(!!snap.worms && snap.worms.worms.length === 1, 'snapshot carries the worm block');
  const b = new World(config, 'normal'); // rolls a different random map + worm seed…
  b.deserialize(snap);                    // …then adopts the canonical state (the MP guest path)
  const aiB = new EnemyAI(b, config.aggression, config.aiPersonality);
  aiB.restore(aiSnap);
  check(hashWorld(a) === hashWorld(b), 'hash agrees immediately after deserialize');
  for (let t = 0; t < 600; t++) { a.update(DT); aiA.update(DT); b.update(DT); aiB.update(DT); }
  check(hashWorld(a) === hashWorld(b), `hash agrees after 600 more ticks (worm a=${a.worms[0].state} b=${b.worms[0].state})`);
  check(JSON.stringify(a.serialize().worms) === JSON.stringify(b.serialize().worms), 'worm blocks byte-identical after 600 ticks');
}

// ---- 6. A building dropped over a submerged worm relocates it instead of trapping it ------
{
  const world = new World({ ...makeSkirmishConfig('balanced', false, 3200), worms: 1 }, 'normal');
  const w = world.worms[0];
  const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
  // Simulate a 3×3 footprint landing on the head (test-only: block grid + rocked terrain).
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const i = world.map.idx(tx + dx, ty + dy);
    world.blocked[i] = 1; world.map.terrain[i] = Terrain.Rock;
  }
  world.update(DT);
  const ntx = Math.floor(w.x / TILE), nty = Math.floor(w.y / TILE);
  const free = !world.blocked[world.map.idx(ntx, nty)] && world.map.terrain[world.map.idx(ntx, nty)] !== Terrain.Rock;
  check(free, `worm under new construction relocated to open sand (${tx},${ty} → ${ntx},${nty})`);
  check(Math.max(Math.abs(ntx - tx), Math.abs(nty - ty)) <= 3, 'relocation is local (≤3 tiles)');
}

// ---- 7. worms: 0 disables ------------------------------------------------------------------
{
  const world = new World({ ...makeSkirmishConfig('balanced', false, 3200), worms: 0 }, 'normal');
  check(world.worms.length === 0, 'worms: 0 spawns none');
}

console.log(failures === 0 ? '\nALL WORM CHECKS PASSED' : `\n${failures} WORM CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
