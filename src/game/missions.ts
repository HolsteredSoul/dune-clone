// Mission definitions. Each is a fully-specified MissionConfig consumed by the World.
// Difficulty scales by enemy base size, starting army, credits, and AI aggression.

import type { MissionConfig } from '../world/world';
import type { Faction } from '../world/defs';

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
