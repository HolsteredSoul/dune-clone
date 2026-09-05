// Selection QoL regression check (pure-sim, no DOM). Drives the shipped applyClickSelect /
// selectSameTypeOnScreen helpers against a real World — not a reimplementation.
//
// Run via: npx esbuild scripts/playability-check.ts --bundle --platform=node --format=esm \
//            --outfile=scripts/playability-check.mjs && node scripts/playability-check.mjs

import { World } from '../src/world/world';
import type { MissionConfig } from '../src/world/world';
import { MISSIONS, makeSkirmishConfig } from '../src/game/missions';
import { TILE } from '../src/world/constants';
import { Camera } from '../src/core/camera';
import {
  applyClickSelect, isDoubleClick, selectSameTypeOnScreen, DOUBLE_CLICK_MS,
} from '../src/game/select';
import type { Selection } from '../src/game/select';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}  ${detail}`);
  }
}

function idsOf(sel: Selection): number[] {
  return [...sel.selected].sort((a, b) => a - b);
}

function at(u: { x: number; y: number }): { wx: number; wy: number } {
  return { wx: u.x, wy: u.y };
}

const cfg: MissionConfig = {
  ...MISSIONS[0],
  fog: false,
  units: [
    { faction: 'player', defId: 'infantry', tx: 12, ty: 52 },
    { faction: 'player', defId: 'infantry', tx: 13, ty: 52 },
    { faction: 'player', defId: 'infantry', tx: 14, ty: 52 },
    { faction: 'player', defId: 'harvester', tx: 11, ty: 48 },
    { faction: 'player', defId: 'harvester', tx: 10, ty: 47 },
    { faction: 'player', defId: 'infantry', tx: 50, ty: 10 }, // off-screen (NE)
    { faction: 'enemy', defId: 'infantry', tx: 15, ty: 52 },
  ],
};

const world = new World(cfg, 'normal');
const cam = new Camera();
cam.resize(640, 480);
cam.centerOn((10 + 0.5) * TILE, (48 + 0.5) * TILE);

const playerInf = world.units.filter((u) => u.owner === 'player' && u.def.id === 'infantry');
const playerHarv = world.units.filter((u) => u.owner === 'player' && u.def.id === 'harvester');
const enemyInf = world.units.filter((u) => u.owner === 'enemy' && u.def.id === 'infantry');

check('world has ≥3 player infantry', playerInf.length >= 3, `count=${playerInf.length}`);
check('world has ≥2 player harvesters', playerHarv.length >= 2, `count=${playerHarv.length}`);
check('world has an enemy infantry', enemyInf.length >= 1);

const onScreenInf = playerInf.filter((u) =>
  u.x >= cam.x && u.x <= cam.x + cam.viewW && u.y >= cam.y && u.y <= cam.y + cam.viewH);
const offScreenInf = playerInf.filter((u) =>
  u.x < cam.x || u.x > cam.x + cam.viewW || u.y < cam.y || u.y > cam.y + cam.viewH);
const onScreenHarv = playerHarv.filter((u) =>
  u.x >= cam.x && u.x <= cam.x + cam.viewW && u.y >= cam.y && u.y <= cam.y + cam.viewH);

check('≥2 infantry on screen', onScreenInf.length >= 2, `on=${onScreenInf.length}`);
check('≥1 infantry off screen', offScreenInf.length >= 1, `off=${offScreenInf.length}`);
check('≥1 harvester on screen', onScreenHarv.length >= 1, `on=${onScreenHarv.length}`);

const a = onScreenInf[0];
const b = onScreenInf[1];
const harv = onScreenHarv[0];
const view = { x: cam.x, y: cam.y, viewW: cam.viewW, viewH: cam.viewH };

// --- (a) plain click replaces the selection with one unit --------------------------------
const sel: Selection = { selected: new Set<number>(), selectedBuilding: null };
applyClickSelect(sel, world, at(a).wx, at(a).wy, 'player', { shift: false, doubleClick: false, view });
check('plain click selects the clicked unit', sel.selected.has(a.id) && sel.selected.size === 1,
  `ids=${idsOf(sel).join(',')}`);

applyClickSelect(sel, world, at(harv).wx, at(harv).wy, 'player', { shift: false, doubleClick: false, view });
check('plain click on a second type replaces (does not add)',
  sel.selected.has(harv.id) && !sel.selected.has(a.id) && sel.selected.size === 1,
  `ids=${idsOf(sel).join(',')}`);

// --- (b) shift-click on a second unit yields a selection containing both -----------------
applyClickSelect(sel, world, at(a).wx, at(a).wy, 'player', { shift: true, doubleClick: false, view });
check('shift-click adds a second unit',
  sel.selected.has(harv.id) && sel.selected.has(a.id) && sel.selected.size === 2,
  `ids=${idsOf(sel).join(',')}`);

// --- (c) shift-click on an already-selected unit removes it ------------------------------
applyClickSelect(sel, world, at(a).wx, at(a).wy, 'player', { shift: true, doubleClick: false, view });
check('shift-click toggles off an already-selected unit',
  !sel.selected.has(a.id) && sel.selected.has(harv.id) && sel.selected.size === 1,
  `ids=${idsOf(sel).join(',')}`);

// shift-click empty keeps the rest
const beforeEmpty = idsOf(sel).join(',');
applyClickSelect(sel, world, 0, 0, 'player', { shift: true, doubleClick: false, view });
check('shift-click empty ground keeps the selection', idsOf(sel).join(',') === beforeEmpty);

// --- (d) same-type select from one infantry ----------------------------------------------
sel.selected.clear();
sel.selectedBuilding = null;
applyClickSelect(sel, world, at(a).wx, at(a).wy, 'player', { shift: false, doubleClick: true, view });

const selectedInf = [...sel.selected].map((id) => world.findUnit(id)!);
check('double-click same-type selects every on-screen infantry',
  onScreenInf.every((u) => sel.selected.has(u.id)),
  `selected=${idsOf(sel).join(',')} onScreen=${onScreenInf.map((u) => u.id).join(',')}`);
check('double-click does not select off-screen infantry of that type',
  offScreenInf.every((u) => !sel.selected.has(u.id)),
  `off=${offScreenInf.map((u) => u.id).join(',')}`);
check('double-click does not select other types',
  selectedInf.every((u) => u.def.id === 'infantry'),
  `kinds=${selectedInf.map((u) => u.def.id).join(',')}`);
check('double-click does not select enemy infantry',
  enemyInf.every((u) => !sel.selected.has(u.id)));
check('double-click selection size equals on-screen infantry count',
  sel.selected.size === onScreenInf.length,
  `size=${sel.selected.size} expected=${onScreenInf.length}`);

// Drive selectSameTypeOnScreen directly (same shipped function the double-click path uses).
const direct = new Set<number>();
selectSameTypeOnScreen(direct, world, view, 'infantry', 'player');
check('selectSameTypeOnScreen matches double-click result',
  [...direct].sort((x, y) => x - y).join(',') === idsOf(sel).join(','));

// Timing helper used by the controller.
check('isDoubleClick within window', isDoubleClick(a.id, 1000, a.id, 1000 + DOUBLE_CLICK_MS - 1) === true);
check('isDoubleClick expires', isDoubleClick(a.id, 1000, a.id, 1000 + DOUBLE_CLICK_MS) === false);
check('isDoubleClick different unit', isDoubleClick(a.id, 1000, b.id, 1100) === false);
check('isDoubleClick unset prev', isDoubleClick(-1, 0, a.id, 10) === false);

// --- (e) skirmish sandworm-count threading (makeSkirmishConfig -> MissionConfig.worms) --------
check('makeSkirmishConfig threads an explicit worm count',
  makeSkirmishConfig('balanced', true, 3200, 2).worms === 2);
check('makeSkirmishConfig defaults worms to 1',
  makeSkirmishConfig('balanced', true, 3200).worms === 1);

console.log(failures === 0
  ? '\nPLAYABILITY CHECK: ALL PASS'
  : `\nPLAYABILITY CHECK: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
