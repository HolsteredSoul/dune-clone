// Terrain-color + unit-silhouette regression check (pure node, no DOM). Drives the shipped
// helpers in src/render/visuals.ts that the renderer paints with — not a reimplementation.
//
// Run via: npx esbuild scripts/visual-check.ts --bundle --platform=node --format=esm \
//            --outfile=scripts/visual-check.mjs && node scripts/visual-check.mjs

import { Terrain } from '../src/world/tilemap';
import { UNITS } from '../src/world/defs';
import { TILE } from '../src/world/constants';
import {
  terrainFillStyle, terrainAccent, terrainDetailKind, terrainVariant, hash2,
  paintTerrainTile, paintUnitBody, unitShape, allUnitShapeIds, rosterUnitIds,
  ownerBodyFill, ownerAccent, PLAYER_COLOR, ENEMY_COLOR, HOUSE_BODY,
} from '../src/render/visuals';
import type { Draw2D, UnitShapeKind } from '../src/render/visuals';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}  ${detail}`);
  }
}

function makeRecorder(): { ctx: Draw2D; fills: string[]; rects: number; paths: string[] } {
  const fills: string[] = [];
  const paths: string[] = [];
  let rects = 0;
  let style = '';
  const ctx: Draw2D = {
    get fillStyle() { return style; },
    set fillStyle(v) { style = String(v); fills.push(style); },
    strokeStyle: '',
    lineWidth: 1,
    fillRect() { rects++; paths.push(`rect:${style}`); },
    strokeRect() { paths.push(`strokerect:${String(this.strokeStyle)}`); },
    beginPath() { paths.push('begin'); },
    moveTo(x, y) { paths.push(`m:${x.toFixed(2)},${y.toFixed(2)}`); },
    lineTo(x, y) { paths.push(`l:${x.toFixed(2)},${y.toFixed(2)}`); },
    closePath() { paths.push('close'); },
    fill() { paths.push(`fill:${style}`); },
    stroke() { paths.push(`stroke:${String(this.strokeStyle)}`); },
    arc(x, y, r) { paths.push(`arc:${x.toFixed(1)},${y.toFixed(1)},${r.toFixed(1)}`); },
    ellipse(x, y, rx, ry) { paths.push(`ell:${x.toFixed(1)},${y.toFixed(1)},${rx.toFixed(1)},${ry.toFixed(1)}`); },
  };
  return { ctx, fills, get rects() { return rects; }, paths };
}

// --- (a) Sand, Rock, Spice produce different fill styles ---------------------------------
const sand = terrainFillStyle(Terrain.Sand, 4, 7);
const rock = terrainFillStyle(Terrain.Rock, 4, 7);
const spice = terrainFillStyle(Terrain.Spice, 4, 7, 400);
const spiceRich = terrainFillStyle(Terrain.Spice, 4, 7, 800);
check('sand ≠ rock', sand !== rock, `sand=${sand} rock=${rock}`);
check('rock ≠ spice', rock !== spice, `rock=${rock} spice=${spice}`);
check('sand ≠ spice', sand !== spice, `sand=${sand} spice=${spice}`);
check('spice is orange-family', /^#[0-9a-f]*[c-f][0-9a-f]*[4-9a-f][0-9a-f]*[0-3]/i.test(spice)
  || /#[dce][0-9a-f]{1}[6-9a-f]/i.test(spice), `spice=${spice}`);
check('rock darker than sand (luma)', luma(rock) < luma(sand), `rock=${luma(rock)} sand=${luma(sand)}`);

function luma(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// --- (b) two Sand tiles are not forced to a (tx+ty)%2 pair --------------------------------
const s00 = terrainFillStyle(Terrain.Sand, 0, 0);
const s10 = terrainFillStyle(Terrain.Sand, 1, 0);
const s20 = terrainFillStyle(Terrain.Sand, 2, 0);
const uniqueSand = new Set<string>();
for (let ty = 0; ty < 8; ty++) {
  for (let tx = 0; tx < 8; tx++) uniqueSand.add(terrainFillStyle(Terrain.Sand, tx, ty));
}
check('more than 2 sand fill styles across an 8×8', uniqueSand.size > 2,
  `count=${uniqueSand.size} colors=${[...uniqueSand].join(',')}`);
check('same-parity sand tiles are not forced equal (not checkerboard)',
  s00 !== s20 || uniqueSand.size > 2,
  `s00=${s00} s20=${s20}`);
check('hash2 is not (tx+ty)%2', hash2(0, 0) !== hash2(2, 0) || hash2(1, 0) !== hash2(3, 0));
check('terrainVariant has >2 buckets', new Set([0, 1, 2, 3, 4, 5, 6, 7].map((x) => terrainVariant(x, 0, 8))).size > 2);
check('sand detail is grain', terrainDetailKind(Terrain.Sand) === 'grain');
check('rock detail is facet', terrainDetailKind(Terrain.Rock) === 'facet');
check('spice detail is bloom', terrainDetailKind(Terrain.Spice) === 'bloom');
check('sand accent ≠ sand fill (intra-tile contrast)',
  terrainAccent(Terrain.Sand, 3, 5) !== terrainFillStyle(Terrain.Sand, 3, 5));

const recSand = makeRecorder();
paintTerrainTile(recSand.ctx, Terrain.Sand, 3, 5, 0, 0, 0, TILE, { n: 0, e: 1, s: 0, w: 2 });
check('paintTerrainTile sand uses >1 fillRect (intra-tile detail)', recSand.rects > 1,
  `rects=${recSand.rects}`);
const recRock = makeRecorder();
paintTerrainTile(recRock.ctx, Terrain.Rock, 3, 5, 0, 0, 0, TILE);
check('paintTerrainTile rock draws a facet path', recRock.paths.some((p) => p.startsWith('m:') || p.startsWith('l:')),
  `paths=${recRock.paths.slice(0, 8).join('|')}`);
const recSpice = makeRecorder();
paintTerrainTile(recSpice.ctx, Terrain.Spice, 3, 5, 800, 0, 0, TILE);
check('paintTerrainTile spice draws a bloom arc', recSpice.paths.some((p) => p.startsWith('arc:')),
  `paths=${recSpice.paths.join('|')}`);

const sandFills = recSand.fills;
const rockFills = recRock.fills;
const spiceFills = recSpice.fills;
check('painted sand/rock/spice fills differ',
  sandFills[0] !== rockFills[0] && rockFills[0] !== spiceFills[0] && sandFills[0] !== spiceFills[0],
  `sand=${sandFills[0]} rock=${rockFills[0]} spice=${spiceFills[0]}`);

// --- (c) each unit def.id has a distinct shape recipe ------------------------------------
const roster = rosterUnitIds();
const kinds = new Set<UnitShapeKind>();
const signatures = new Map<string, string>();
check('roster covers the seven combat/econ types',
  ['infantry', 'rocket', 'scout', 'harvester', 'tank', 'artillery', 'aircraft']
    .every((id) => roster.includes(id) && id in UNITS),
  `roster=${roster.join(',')}`);

for (const id of roster) {
  const recipe = unitShape(id);
  check(`recipe id matches ${id}`, recipe.id === id, `recipe.id=${recipe.id}`);
  check(`unique kind for ${id}`, !kinds.has(recipe.kind), `kind=${recipe.kind}`);
  kinds.add(recipe.kind);
  const rec = makeRecorder();
  paintUnitBody(rec.ctx, recipe, UNITS[id].radius, '#ffffff', '#000000', { loadFrac: 0.5 });
  const sig = rec.paths.join('|');
  check(`paint signature unique for ${id}`, ![...signatures.values()].includes(sig),
    `sig=${sig.slice(0, 80)}`);
  signatures.set(id, sig);
  check(`${id} is not a 3-point triangle-only path`,
    !(rec.paths.filter((p) => p.startsWith('m:') || p.startsWith('l:')).length === 3
      && rec.paths.filter((p) => p.startsWith('ell:') || p.startsWith('arc:') || p.startsWith('rect:')).length === 0),
    `paths=${rec.paths.join('|')}`);
}
check('allUnitShapeIds covers the roster',
  roster.every((id) => allUnitShapeIds().includes(id)));

// Feature flags differ across types (silhouette identity, not just a color swap).
check('rocket has pack, infantry does not',
  unitShape('rocket').hasPack === true && unitShape('infantry').hasPack === false);
check('tank has turret, artillery does not',
  unitShape('tank').hasTurret === true && unitShape('artillery').hasTurret === false);
check('aircraft has wings', unitShape('aircraft').hasWings === true);
check('scout has wheels, tank does not',
  unitShape('scout').hasWheels === true && unitShape('tank').hasWheels === false);
check('harvester has hopper', unitShape('harvester').hasHopper === true);
check('artillery barrel longer hull than tank (siege silhouette)',
  unitShape('artillery').hasBarrel === true && unitShape('tank').hasBarrel === true
    && unitShape('artillery').hullW < unitShape('tank').hullW);

// --- (d) player vs enemy (house) owner colors differ -------------------------------------
check('player accent ≠ enemy accent',
  ownerAccent('player', 'player') !== ownerAccent('enemy', 'player'),
  `${ownerAccent('player', 'player')} vs ${ownerAccent('enemy', 'player')}`);
check('local-faction flip still differs',
  ownerAccent('enemy', 'enemy') !== ownerAccent('player', 'enemy'));
check('Atreides body ≠ Harkonnen body',
  ownerBodyFill('player', 'atreides') !== ownerBodyFill('enemy', 'harkonnen'),
  `${HOUSE_BODY.atreides} vs ${HOUSE_BODY.harkonnen}`);
check('player accent is the bright local green', ownerAccent('player', 'player') === PLAYER_COLOR);
check('enemy accent is the enemy red', ownerAccent('enemy', 'player') === ENEMY_COLOR);
check('house body is not the 2px-pip-only green (body uses house paint)',
  ownerBodyFill('player', 'atreides') !== PLAYER_COLOR
    && ownerBodyFill('player', 'harkonnen') !== PLAYER_COLOR);

console.log(failures === 0
  ? '\nVISUAL CHECK: ALL PASS'
  : `\nVISUAL CHECK: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
