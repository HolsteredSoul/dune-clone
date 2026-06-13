// Focused rally-point regression check (pure-sim, no DOM). Verifies that a producer building
// can hold a rally point and that World.completeUnit issues a move/attackMove order toward it.
//
// Run via: npx esbuild scripts/rally-check.ts --bundle --platform=node --format=esm \
//            --outfile=scripts/rally-check.mjs && node scripts/rally-check.mjs

import { World } from '../src/world/world';
import { MISSIONS } from '../src/game/missions';
import { TILE } from '../src/world/constants';
import type { Building } from '../src/world/building';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}  ${detail}`);
  }
}

// Mission 2 starts the player with a barracks (an infantry producer) and ample credits.
const world = new World(MISSIONS[1], 'normal');

const barracks = world.buildings.find(
  (b: Building) => b.owner === 'player' && b.def.id === 'barracks',
);
if (!barracks) {
  console.log('  FAIL  expected a player barracks in mission 2');
  process.exit(1);
}

// --- 1. A producer can hold a rally point ---------------------------------------------------
check('barracks.isProducer', barracks.isProducer === true);
check('rally starts null', barracks.rallyX === null && barracks.rallyY === null);

// Put the rally well away from the barracks and off any spice so it resolves to a plain move/A-move.
const rallyWx = (barracks.tx + 10) * TILE;
const rallyWy = (barracks.ty - 3) * TILE;
world.setRally(barracks, rallyWx, rallyWy);
check('setRally stored a point', barracks.rallyX !== null && barracks.rallyY !== null,
  `rallyX=${barracks.rallyX} rallyY=${barracks.rallyY}`);
const rx = barracks.rallyX!;
const ry = barracks.rallyY!;

// --- 2. completeUnit issues a move/attackMove toward the rally ------------------------------
// Queue an infantry (combat unit, has a weapon) and step the sim until it pops out.
const before = world.units.filter((u) => u.owner === 'player').length;
const queued = world.queueUnit('player', 'infantry');
check('queueUnit infantry accepted', queued === true);

const DT = 1 / 30;
while (world.units.filter((u) => u.owner === 'player').length === before && world.time < 60) {
  world.update(DT);
}
const spawned = world.units
  .filter((u) => u.owner === 'player' && u.def.id === 'infantry')
  // newest infantry is the one nearest the barracks exit and not one of the two starting ones
  .sort((a, b) => b.id - a.id)[0];

check('a new infantry was produced',
  world.units.filter((u) => u.owner === 'player').length > before,
  `before=${before} after=${world.units.filter((u) => u.owner === 'player').length}`);

if (spawned) {
  const k = spawned.order.kind;
  check('spawned unit got move/attackMove order (not idle)',
    k === 'attackMove' || k === 'move',
    `order.kind=${k}`);
  // The order's goal should be the rally point (combat unit => attackMove with gx/gy == rally).
  const gx = spawned.order.gx;
  const gy = spawned.order.gy;
  check('order goal points at the rally',
    gx !== undefined && gy !== undefined
      && Math.abs(gx - rx) < TILE && Math.abs(gy - ry) < TILE,
    `gx=${gx} gy=${gy} rally=(${rx},${ry})`);
}

// --- 3. clearRally falls back to default behaviour ------------------------------------------
world.clearRally(barracks);
check('clearRally resets to null', barracks.rallyX === null && barracks.rallyY === null);

const before2 = world.units.filter((u) => u.owner === 'player').length;
world.queueUnit('player', 'infantry');
let t2 = world.time;
while (world.units.filter((u) => u.owner === 'player').length === before2 && world.time - t2 < 60) {
  world.update(DT);
}
const spawned2 = world.units
  .filter((u) => u.owner === 'player' && u.def.id === 'infantry')
  .sort((a, b) => b.id - a.id)[0];
if (spawned2 && spawned2 !== spawned) {
  check('with no rally, new combat unit is idle at exit', spawned2.order.kind === 'idle',
    `order.kind=${spawned2.order.kind}`);
}

console.log(failures === 0
  ? '\nRALLY CHECK: ALL PASS'
  : `\nRALLY CHECK: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
