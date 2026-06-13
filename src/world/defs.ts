// Data-driven definitions for every building and unit. Adding content = adding an entry here;
// systems read these defs generically rather than hard-coding per-type logic.

export type Faction = 'player' | 'enemy';

export type ProduceKind = 'building' | 'infantry' | 'vehicle' | 'aircraft';

// Combat posture that governs a unit's autonomous behaviour when it has no explicit order.
export type Stance = 'aggressive' | 'guard' | 'holdground' | 'holdfire';

export const STANCE_LABEL: Record<Stance, string> = {
  aggressive: 'Aggressive',
  guard: 'Guard',
  holdground: 'Hold Grnd',
  holdfire: 'Hold Fire',
};

// ---- Difficulty ----------------------------------------------------------------------------
// One enum + one multiplier table is the entire difficulty mechanism. It scales the enemy
// (economy + aggression/cadence) and handicaps the player's starting credits — nothing else.
// Owned by Game (session-persistent), applied at World/EnemyAI construction time.
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyMods {
  label: string;            // shown on the picker button
  enemyCreditMult: number;  // scales config.enemyCredits (at World construction)
  playerCreditMult: number; // scales config.playerCredits (at World construction)
  aggressionMult: number;   // multiplies mission aggression -> EnemyAI waveSize seed
  thinkInterval: number;    // seconds between AI think ticks (lower = faster cadence)
  waveCap: number;          // max army size the AI masses before each attack
  trainCreditFloor: number; // multiplier on the AI's train credit thresholds
}

export const DIFFICULTY: Record<Difficulty, DifficultyMods> = {
  easy:   { label: 'EASY',   enemyCreditMult: 0.75, playerCreditMult: 1.25, aggressionMult: 0.75, thinkInterval: 1.8, waveCap: 8,  trainCreditFloor: 1.25 },
  normal: { label: 'NORMAL', enemyCreditMult: 1.2,  playerCreditMult: 1.0,  aggressionMult: 1.05, thinkInterval: 1.3,  waveCap: 13, trainCreditFloor: 0.95 },
  hard:   { label: 'HARD',   enemyCreditMult: 1.28, playerCreditMult: 0.97, aggressionMult: 1.1,  thinkInterval: 1.2,  waveCap: 14, trainCreditFloor: 0.92 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

export interface WeaponDef {
  damage: number;
  range: number;          // px
  cooldown: number;       // seconds between shots
  projectileSpeed: number; // px/sec (high = bullet-like; instant-ish)
  splash?: number;        // px radius of splash damage (optional)
  color: string;
}

export interface BuildingDef {
  id: string;
  name: string;
  w: number;              // footprint width in tiles
  h: number;              // footprint height in tiles
  cost: number;
  buildTime: number;      // seconds at full power
  maxHp: number;
  power: number;          // >0 produces, <0 consumes
  requires: string[];     // building ids the owner must possess to unlock this
  produces?: ProduceKind; // what this building's menu offers (if any)
  sight: number;          // vision radius in tiles
  weapon?: WeaponDef;     // defensive structures only
  spawnsHarvester?: boolean; // refinery gifts a harvester on completion
  color: string;
  trim: string;
}

export interface UnitDef {
  id: string;
  name: string;
  kind: ProduceKind;      // infantry | vehicle | aircraft
  cost: number;
  buildTime: number;
  maxHp: number;
  speed: number;          // px/sec
  sight: number;          // tiles
  radius: number;         // px (draw + separation)
  builtAt: string;        // building id that produces it
  flying?: boolean;
  harvester?: boolean;
  weapon?: WeaponDef;
  color: string;
  trim: string;
}

// ---- Buildings ----------------------------------------------------------------------------
export const BUILDINGS: Record<string, BuildingDef> = {
  yard: {
    id: 'yard', name: 'Construction Yard', w: 3, h: 3, cost: 0, buildTime: 0,
    maxHp: 1200, power: 0, requires: [], produces: 'building', sight: 6,
    color: '#5b6b7a', trim: '#39434d',
  },
  power: {
    id: 'power', name: 'Power Plant', w: 2, h: 2, cost: 300, buildTime: 4,
    maxHp: 350, power: 120, requires: ['yard'], sight: 3,
    color: '#4a7a5b', trim: '#2f4d39',
  },
  refinery: {
    id: 'refinery', name: 'Spice Refinery', w: 3, h: 2, cost: 400, buildTime: 6,
    maxHp: 650, power: -30, requires: ['power'], sight: 4, spawnsHarvester: true,
    color: '#7a6a4a', trim: '#4d422f',
  },
  barracks: {
    id: 'barracks', name: 'Barracks', w: 2, h: 2, cost: 300, buildTime: 5,
    maxHp: 450, power: -20, requires: ['power'], produces: 'infantry', sight: 3,
    color: '#7a5b4a', trim: '#4d392f',
  },
  radar: {
    id: 'radar', name: 'Radar Outpost', w: 2, h: 2, cost: 500, buildTime: 6,
    maxHp: 450, power: -40, requires: ['refinery'], sight: 9,
    color: '#4a6a7a', trim: '#2f424d',
  },
  turret: {
    id: 'turret', name: 'Gun Turret', w: 1, h: 1, cost: 200, buildTime: 4,
    maxHp: 620, power: -20, requires: ['power'], sight: 6,
    weapon: { damage: 26, range: 170, cooldown: 1.0, projectileSpeed: 420, color: '#ffd27a' },
    color: '#6b6b75', trim: '#3d3d45',
  },
  factory: {
    id: 'factory', name: 'War Factory', w: 3, h: 2, cost: 700, buildTime: 8,
    maxHp: 700, power: -30, requires: ['radar'], produces: 'vehicle', sight: 3,
    color: '#75707a', trim: '#45424d',
  },
  helipad: {
    id: 'helipad', name: 'Helipad', w: 2, h: 2, cost: 800, buildTime: 9,
    maxHp: 450, power: -30, requires: ['factory'], produces: 'aircraft', sight: 4,
    color: '#5a5a8a', trim: '#39395a',
  },
};

// Order buildings appear in the construction-yard menu.
export const BUILD_MENU_ORDER = [
  'power', 'refinery', 'barracks', 'turret', 'radar', 'factory', 'helipad',
];

// ---- Units --------------------------------------------------------------------------------
export const UNITS: Record<string, UnitDef> = {
  infantry: {
    id: 'infantry', name: 'Light Infantry', kind: 'infantry', cost: 90, buildTime: 3.5,
    maxHp: 95, speed: 52, sight: 5, radius: 6, builtAt: 'barracks',
    weapon: { damage: 14, range: 115, cooldown: 0.85, projectileSpeed: 460, color: '#fff3c2' },
    color: '#c95b4a', trim: '#7a2f24',
  },
  harvester: {
    id: 'harvester', name: 'Harvester', kind: 'vehicle', cost: 350, buildTime: 7,
    maxHp: 320, speed: 110, sight: 4, radius: 11, builtAt: 'factory', harvester: true,
    color: '#caa84a', trim: '#7a5a1e',
  },
  tank: {
    id: 'tank', name: 'Battle Tank', kind: 'vehicle', cost: 450, buildTime: 8,
    maxHp: 340, speed: 68, sight: 6, radius: 11, builtAt: 'factory',
    weapon: { damage: 38, range: 155, cooldown: 1.6, projectileSpeed: 340, splash: 22, color: '#ffd27a' },
    color: '#8a7a4a', trim: '#544a2f',
  },
  aircraft: {
    id: 'aircraft', name: 'Ornithopter', kind: 'aircraft', cost: 600, buildTime: 9,
    maxHp: 150, speed: 175, sight: 7, radius: 9, builtAt: 'helipad', flying: true,
    weapon: { damage: 26, range: 140, cooldown: 1.0, projectileSpeed: 520, color: '#fff3c2' },
    color: '#6a6ab5', trim: '#39395a',
  },
};

// Which unit each producing building offers.
export const UNIT_MENU: Record<ProduceKind, string[]> = {
  building: [],
  infantry: ['infantry'],
  vehicle: ['harvester', 'tank'],
  aircraft: ['aircraft'],
};
