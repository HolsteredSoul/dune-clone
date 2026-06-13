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
  const p = playerCore();
  return {
    name: 'Mission 1 — Foothold',
    brief: 'Establish your economy and destroy the enemy base to the north-east. '
      + 'Build a Barracks for infantry, mass a force, and push out before their waves build up.',
    fog: true,
    aggression: 0.82,
    playerCredits: 2600,
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
    brief: 'The enemy is dug in with a War Factory and armour. Build your own Factory '
      + '(via Radar), bring tanks, and use Hold-Ground turrets to break their attacks.',
    fog: true,
    aggression: 1.0,
    playerCredits: 2900,
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
      { faction: 'enemy', defId: 'harvester', tx: 51, ty: 11 },
      { faction: 'enemy', defId: 'harvester', tx: 52, ty: 11 },
      { faction: 'enemy', defId: 'infantry', tx: 46, ty: 12 },
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
      + 'with their economy running hot. Mass tanks, hold the line against their waves, and '
      + 'grind down their headquarters. (Build a Helipad for Ornithopters of your own.)',
    fog: true,
    aggression: 0.95,
    playerCredits: 3800,
    enemyCredits: 1800,
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
      { faction: 'enemy', defId: 'infantry', tx: 48, ty: 12 },
    ],
  };
})();

export const MISSIONS: MissionConfig[] = [MISSION_1, MISSION_2, MISSION_3];
