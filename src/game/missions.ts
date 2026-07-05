// Mission definitions. Each is a fully-specified MissionConfig consumed by the World.
// Difficulty scales by enemy base size, starting army, credits, and AI aggression.

import type { MissionConfig } from '../world/world';
import type { Faction } from '../world/defs';
import { MAP_W, MAP_H } from '../world/constants';

type B = { faction: Faction; defId: string; tx: number; ty: number };
type U = { faction: Faction; defId: string; tx: number; ty: number };

const SPICE = [
  { tx: 16, ty: 44, r: 3 },
  { tx: 30, ty: 31, r: 4 },
  { tx: 44, ty: 14, r: 3 },
  { tx: 23, ty: 19, r: 3 },
  { tx: 41, ty: 45, r: 3 },
];

// Player always starts bottom-left with a small economic core.
function playerCore(extra: B[] = [], extraU: U[] = []): { b: B[]; u: U[] } {
  const b: B[] = [
    { faction: 'player', defId: 'yard', tx: 8, ty: 49 },
    { faction: 'player', defId: 'power', tx: 12, ty: 49 },
    { faction: 'player', defId: 'refinery', tx: 8, ty: 46 },
    ...extra,
  ];
  const u: U[] = [
    { faction: 'player', defId: 'harvester', tx: 11, ty: 48 },
    { faction: 'player', defId: 'harvester', tx: 10, ty: 47 },
    { faction: 'player', defId: 'infantry', tx: 12, ty: 52 },
    { faction: 'player', defId: 'infantry', tx: 13, ty: 52 },
    ...extraU,
  ];
  return { b, u };
}

// Skirmish: a fair, symmetric start. The enemy gets the SAME economic core as the player
// (yard + power + refinery + 2 harvesters + 2 infantry), mirrored to the NE corner using the
// campaign's proven enemy coordinates, and bootstraps the rest of its base from its build order.
// No pre-placed army or tech on either side — the match is decided by play + the picked knobs.
function enemyCore(): { b: B[]; u: U[] } {
  const b: B[] = [
    { faction: 'enemy', defId: 'yard', tx: 50, ty: 6 },
    { faction: 'enemy', defId: 'power', tx: 54, ty: 6 },
    { faction: 'enemy', defId: 'refinery', tx: 50, ty: 9 },
  ];
  const u: U[] = [
    { faction: 'enemy', defId: 'harvester', tx: 51, ty: 11 },
    { faction: 'enemy', defId: 'harvester', tx: 52, ty: 11 },
    { faction: 'enemy', defId: 'infantry', tx: 47, ty: 11 },
    { faction: 'enemy', defId: 'infantry', tx: 48, ty: 11 },
  ];
  return { b, u };
}

// The two corner coordinate tables used by skirmish (variant mode may swap which faction gets
// which corner). SW mirrors playerCore()'s layout, NE mirrors enemyCore()'s — kept separate from
// those functions so the campaign missions (which call playerCore()/enemyCore() directly) are
// untouched by the corner-swap logic.
function skirmishCore(faction: Faction, corner: 'sw' | 'ne'): { b: B[]; u: U[] } {
  if (corner === 'sw') {
    return {
      b: [
        { faction, defId: 'yard', tx: 8, ty: 49 },
        { faction, defId: 'power', tx: 12, ty: 49 },
        { faction, defId: 'refinery', tx: 8, ty: 46 },
      ],
      u: [
        { faction, defId: 'harvester', tx: 11, ty: 48 },
        { faction, defId: 'harvester', tx: 10, ty: 47 },
        { faction, defId: 'infantry', tx: 12, ty: 52 },
        { faction, defId: 'infantry', tx: 13, ty: 52 },
      ],
    };
  }
  return {
    b: [
      { faction, defId: 'yard', tx: 50, ty: 6 },
      { faction, defId: 'power', tx: 54, ty: 6 },
      { faction, defId: 'refinery', tx: 50, ty: 9 },
    ],
    u: [
      { faction, defId: 'harvester', tx: 51, ty: 11 },
      { faction, defId: 'harvester', tx: 52, ty: 11 },
      { faction, defId: 'infantry', tx: 47, ty: 11 },
      { faction, defId: 'infantry', tx: 48, ty: 11 },
    ],
  };
}

// Base anchor points used to keep randomized spice off both starting economies.
const SW_BASE = { tx: 8, ty: 49 };
const NE_BASE = { tx: 50, ty: 6 };

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// Randomized symmetric spice: one r=4 field dead-center plus two mirrored pairs of r=3 fields
// (point-reflected through the map center so both corners are equally served). Total mass
// (sum r^2 = 16 + 9*4 = 52) matches the static SPICE layout above. Rejection-sampled with a
// bounded retry so fields stay off the map edge, clear of both bases, and clear of each other;
// falls back to the static layout in the (practically unreachable) case retries are exhausted.
function randomSpiceLayout(): { tx: number; ty: number; r: number }[] {
  const MIN = 6, MAX = 57; // 6 <= tx,ty <= 57
  const MIN_FROM_BASE = 12;
  const MIN_FROM_FIELD = 9;
  const cx = MAP_W / 2, cy = MAP_H / 2; // 32, 32 — exact map center
  const placed: { tx: number; ty: number }[] = [{ tx: cx, ty: cy }]; // center field counts as placed
  const fields: { tx: number; ty: number; r: number }[] = [{ tx: cx, ty: cy, r: 4 }];

  for (let pair = 0; pair < 2; pair++) {
    let ok = false;
    for (let attempt = 0; attempt < 200 && !ok; attempt++) {
      const tx = Math.floor(MIN + Math.random() * (MAX - MIN + 1));
      const ty = Math.floor(MIN + Math.random() * (MAX - MIN + 1));
      const mx = MAP_W - 1 - tx, my = MAP_H - 1 - ty; // point reflection through map center
      if (dist(tx, ty, SW_BASE.tx, SW_BASE.ty) < MIN_FROM_BASE) continue;
      if (dist(tx, ty, NE_BASE.tx, NE_BASE.ty) < MIN_FROM_BASE) continue;
      if (dist(mx, my, SW_BASE.tx, SW_BASE.ty) < MIN_FROM_BASE) continue;
      if (dist(mx, my, NE_BASE.tx, NE_BASE.ty) < MIN_FROM_BASE) continue;
      if (placed.some((p) => dist(tx, ty, p.tx, p.ty) < MIN_FROM_FIELD)) continue;
      if (placed.some((p) => dist(mx, my, p.tx, p.ty) < MIN_FROM_FIELD)) continue;
      if (dist(tx, ty, mx, my) < MIN_FROM_FIELD) continue;
      placed.push({ tx, ty }, { tx: mx, ty: my });
      fields.push({ tx, ty, r: 3 }, { tx: mx, ty: my, r: 3 });
      ok = true;
    }
    if (!ok) return SPICE; // couldn't satisfy constraints — fall back to the static layout
  }
  return fields;
}

/** Starting-credits presets for the skirmish setup screen (id/label/value). */
export const SKIRMISH_CREDITS = [
  { id: 'low', label: 'Low', value: 2000 },
  { id: 'standard', label: 'Standard', value: 3200 },
  { id: 'high', label: 'High', value: 5000 },
] as const;

/** Build a one-off skirmish MissionConfig: symmetric economy, equal credits (difficulty mods then
 *  tilt it), destroyAll win condition, and the chosen enemy AI archetype. Used by BOTH the
 *  controller (game.ts) and the balance harness (sim.ts) so they test the same thing.
 *  When `variant` is true (default, single-player skirmish only) each match gets a freshly
 *  randomized symmetric spice layout and a coin-flip corner swap (player SW/NE, enemy the
 *  opposite); `variant = false` reproduces the exact legacy static layout (used by MP, which
 *  needs a fixed map both peers agree on ahead of the lockstep session). */
export function makeSkirmishConfig(personality = 'balanced', variant = true, credits = 3200): MissionConfig {
  if (!variant) {
    const p = playerCore();
    const e = enemyCore();
    return {
      name: 'Skirmish',
      brief: 'A fair fight from a bare economy — out-build, out-tech, and raze the enemy base.',
      fog: true,
      aggression: 1.0,
      aiPersonality: personality,
      playerCredits: credits,
      enemyCredits: credits, // symmetric; DIFFICULTY credit mults supply the Easy/Normal/Hard tilt
      cameraStart: { tx: 10, ty: 48 },
      spiceFields: SPICE,
      buildings: [...p.b, ...e.b],
      units: [...p.u, ...e.u],
    };
  }

  const playerCorner: 'sw' | 'ne' = Math.random() < 0.5 ? 'sw' : 'ne';
  const enemyCorner: 'sw' | 'ne' = playerCorner === 'sw' ? 'ne' : 'sw';
  const p = skirmishCore('player', playerCorner);
  const e = skirmishCore('enemy', enemyCorner);
  return {
    name: 'Skirmish',
    brief: 'A fair fight from a bare economy — out-build, out-tech, and raze the enemy base.',
    fog: true,
    aggression: 1.0,
    aiPersonality: personality,
    playerCredits: credits,
    enemyCredits: credits, // symmetric; DIFFICULTY credit mults supply the Easy/Normal/Hard tilt
    cameraStart: playerCorner === 'sw' ? { tx: 10, ty: 48 } : { tx: 52, ty: 8 },
    spiceFields: randomSpiceLayout(),
    buildings: [...p.b, ...e.b],
    units: [...p.u, ...e.u],
  };
}

const MISSION_1: MissionConfig = (() => {
  const p = playerCore([
    { faction: 'player', defId: 'barracks', tx: 12, ty: 46 },
  ]);
  return {
    name: 'Mission 1 — Foothold',
    brief: 'Establish your economy and destroy the enemy base to the north-east. Your Barracks '
      + 'trains infantry and Rocket Troopers (your anti-armour answer) — mass a mixed force and '
      + 'push out before their waves build up.',
    fog: true,
    aggression: 0.82,
    // Campaign uses the 'balanced' default (preserves the sim-verified ladder). The other
    // PERSONALITIES (rusher/mechanized/turtle/economist) are wired + work (they swing the sim
    // win-rate 40–90pp) but assigning them needs a dedicated per-mission rebalance — deferred to
    // a focused balance session / skirmish mode rather than guessed autonomously.
    playerCredits: 3000,
    enemyCredits: 1700,
    cameraStart: { tx: 10, ty: 48 },
    spiceFields: SPICE,
    buildings: [
      ...p.b,
      { faction: 'enemy', defId: 'yard', tx: 50, ty: 6 },
      { faction: 'enemy', defId: 'power', tx: 54, ty: 6 },
      { faction: 'enemy', defId: 'power', tx: 54, ty: 9 },
      { faction: 'enemy', defId: 'refinery', tx: 50, ty: 9 },
      { faction: 'enemy', defId: 'barracks', tx: 47, ty: 6 },
      { faction: 'enemy', defId: 'radar', tx: 44, ty: 6 },
      { faction: 'enemy', defId: 'factory', tx: 47, ty: 9 },
      { faction: 'enemy', defId: 'turret', tx: 49, ty: 10 },
    ],
    units: [
      ...p.u,
      { faction: 'enemy', defId: 'harvester', tx: 51, ty: 11 },
      { faction: 'enemy', defId: 'harvester', tx: 52, ty: 11 },
      { faction: 'enemy', defId: 'infantry', tx: 47, ty: 11 },
      { faction: 'enemy', defId: 'infantry', tx: 48, ty: 11 },
    ],
  };
})();

const MISSION_2: MissionConfig = (() => {
  const p = playerCore([
    { faction: 'player', defId: 'barracks', tx: 12, ty: 46 },
    { faction: 'player', defId: 'power', tx: 12, ty: 51 },
  ]);
  return {
    name: 'Mission 2 — Escalation',
    brief: 'The enemy is dug in with a War Factory and armour — including Rocket Troopers that '
      + 'melt tanks. Build your own Factory (via Radar), mix Rocket Troopers with tanks, and '
      + 'use Hold-Ground turrets to break their attacks. The Radar also unlocks combat Upgrades.',
    fog: true,
    aggression: 1.0,
    playerCredits: 3600,
    enemyCredits: 1750,
    cameraStart: { tx: 10, ty: 48 },
    spiceFields: SPICE,
    buildings: [
      ...p.b,
      { faction: 'enemy', defId: 'yard', tx: 50, ty: 6 },
      { faction: 'enemy', defId: 'power', tx: 54, ty: 6 },
      { faction: 'enemy', defId: 'power', tx: 54, ty: 9 },
      { faction: 'enemy', defId: 'refinery', tx: 50, ty: 9 },
      { faction: 'enemy', defId: 'barracks', tx: 47, ty: 6 },
      { faction: 'enemy', defId: 'radar', tx: 44, ty: 6 },
      { faction: 'enemy', defId: 'factory', tx: 47, ty: 9 },
      { faction: 'enemy', defId: 'turret', tx: 49, ty: 12 },
    ],
    units: [
      ...p.u,
      { faction: 'enemy', defId: 'harvester', tx: 51, ty: 11 },
      { faction: 'enemy', defId: 'harvester', tx: 52, ty: 11 },
      { faction: 'enemy', defId: 'rocket', tx: 46, ty: 12 },
      { faction: 'enemy', defId: 'infantry', tx: 45, ty: 12 },
      { faction: 'enemy', defId: 'tank', tx: 44, ty: 11 },
      { faction: 'enemy', defId: 'tank', tx: 43, ty: 11 },
    ],
  };
})();

const MISSION_3: MissionConfig = (() => {
  const p = playerCore(
    [
      { faction: 'player', defId: 'power', tx: 12, ty: 51 },
      { faction: 'player', defId: 'barracks', tx: 12, ty: 46 },
      { faction: 'player', defId: 'turret', tx: 10, ty: 52 },
      { faction: 'player', defId: 'turret', tx: 15, ty: 49 },
    ],
    [
      { faction: 'player', defId: 'tank', tx: 14, ty: 53 },
      { faction: 'player', defId: 'tank', tx: 15, ty: 53 },
    ],
  );
  return {
    name: 'Mission 3 — Stronghold',
    brief: 'The enemy is dug in at full strength — a War Factory, armour, and gun turrets, '
      + 'with their economy running hot. Mass tanks, build Artillery to outrange their turret '
      + 'line, hold against their waves, and grind down their HQ. (Helipad = Ornithopters; '
      + 'Radar = Upgrades.)',
    fog: true,
    aggression: 0.95,
    playerCredits: 3750,
    enemyCredits: 1850,
    cameraStart: { tx: 10, ty: 48 },
    spiceFields: SPICE,
    buildings: [
      ...p.b,
      { faction: 'enemy', defId: 'yard', tx: 50, ty: 6 },
      { faction: 'enemy', defId: 'power', tx: 54, ty: 6 },
      { faction: 'enemy', defId: 'power', tx: 54, ty: 9 },
      { faction: 'enemy', defId: 'refinery', tx: 50, ty: 9 },
      { faction: 'enemy', defId: 'barracks', tx: 47, ty: 6 },
      { faction: 'enemy', defId: 'radar', tx: 44, ty: 6 },
      { faction: 'enemy', defId: 'factory', tx: 47, ty: 9 },
      { faction: 'enemy', defId: 'turret', tx: 49, ty: 12 },
    ],
    units: [
      ...p.u,
      { faction: 'enemy', defId: 'harvester', tx: 51, ty: 14 },
      { faction: 'enemy', defId: 'tank', tx: 45, ty: 12 },
      { faction: 'enemy', defId: 'tank', tx: 44, ty: 13 },
      { faction: 'enemy', defId: 'rocket', tx: 48, ty: 12 },
    ],
  };
})();

// Mission 4 introduces a NEW objective type: survive a timed onslaught (you can't out-produce
// them in time — dig in and hold, though wiping them early still wins). Reuses M3's verified
// player layout; the enemy is bigger + more aggressive and the win condition is the clock.
const MISSION_4: MissionConfig = (() => {
  const p = playerCore(
    [
      { faction: 'player', defId: 'power', tx: 12, ty: 51 },
      { faction: 'player', defId: 'barracks', tx: 12, ty: 46 },
      { faction: 'player', defId: 'turret', tx: 10, ty: 52 },
      { faction: 'player', defId: 'turret', tx: 15, ty: 49 },
    ],
    [
      { faction: 'player', defId: 'tank', tx: 14, ty: 53 },
      { faction: 'player', defId: 'tank', tx: 15, ty: 53 },
      { faction: 'player', defId: 'rocket', tx: 13, ty: 53 },
    ],
  );
  return {
    name: 'Mission 4 — Last Stand',
    brief: 'A massive assault is inbound and you cannot raze their base in time — dig in and '
      + 'SURVIVE for four minutes until reinforcements arrive. Wall up with turrets (build more!), '
      + 'keep Rocket Troopers back for their armour, and hold the line. Watch the HOLD timer up '
      + 'top. (Wiping them out early also wins.)',
    fog: true,
    aggression: 1.15,
    objective: { kind: 'survive', timeLimit: 240 },
    playerCredits: 4300,
    enemyCredits: 2400,
    cameraStart: { tx: 10, ty: 48 },
    spiceFields: SPICE,
    buildings: [
      ...p.b,
      { faction: 'enemy', defId: 'yard', tx: 50, ty: 6 },
      { faction: 'enemy', defId: 'power', tx: 54, ty: 6 },
      { faction: 'enemy', defId: 'power', tx: 54, ty: 9 },
      { faction: 'enemy', defId: 'refinery', tx: 50, ty: 9 },
      { faction: 'enemy', defId: 'barracks', tx: 47, ty: 6 },
      { faction: 'enemy', defId: 'radar', tx: 44, ty: 6 },
      { faction: 'enemy', defId: 'factory', tx: 47, ty: 9 },
      { faction: 'enemy', defId: 'turret', tx: 49, ty: 12 },
    ],
    units: [
      ...p.u,
      { faction: 'enemy', defId: 'harvester', tx: 51, ty: 14 },
      { faction: 'enemy', defId: 'harvester', tx: 52, ty: 14 },
      { faction: 'enemy', defId: 'tank', tx: 45, ty: 12 },
      { faction: 'enemy', defId: 'tank', tx: 44, ty: 13 },
      { faction: 'enemy', defId: 'rocket', tx: 48, ty: 12 },
      { faction: 'enemy', defId: 'infantry', tx: 45, ty: 11 },
    ],
  };
})();

export const MISSIONS: MissionConfig[] = [MISSION_1, MISSION_2, MISSION_3, MISSION_4];
