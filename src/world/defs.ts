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
  easy:   { label: 'EASY',   enemyCreditMult: 0.70, playerCreditMult: 1.25, aggressionMult: 0.75, thinkInterval: 1.8, waveCap: 8,  trainCreditFloor: 1.25 },
  normal: { label: 'NORMAL', enemyCreditMult: 1.0,  playerCreditMult: 1.1,  aggressionMult: 1.0,  thinkInterval: 1.3,  waveCap: 13, trainCreditFloor: 0.95 },
  hard:   { label: 'HARD',   enemyCreditMult: 1.08, playerCreditMult: 1.05, aggressionMult: 1.08, thinkInterval: 1.2,  waveCap: 14, trainCreditFloor: 0.92 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

// ---- Houses (faction asymmetry) ------------------------------------------------------------
// Atreides vs Harkonnen along the classic precision-vs-brute axis. Each house is ONE owner-wide
// multiplier applied at a single site (damage in World.fire, HP in applyUpgradeStats), kept near
// mirror-balanced (+12% damage ≈ +12% HP) so the verified ladder barely moves. Assigned per
// faction-slot per mission (default: player = Atreides, enemy = Harkonnen — the canonical Dune
// matchup). A house picker + distinct rosters/superweapons are a future layer on this foundation.
export type House = 'atreides' | 'harkonnen';

export interface HouseMods {
  id: House;
  name: string;
  blurb: string;       // one-line identity, shown on the mission brief
  damageMult: number;  // owner-wide weapon damage (units + turrets)
  hpMult: number;      // owner-wide unit HP
}

// Glass-cannon vs tank, with each house's damage buff exactly equal to the other's HP buff so
// unit-vs-unit time-to-kill is mathematically neutral (1.10 dmg / 1.10 HP = 1.0 both ways) — the
// houses differ in feel + the residual base-razing pace, not raw power. Verified near-mirror by sim.
export const HOUSES: Record<House, HouseMods> = {
  atreides:  { id: 'atreides',  name: 'Atreides',  blurb: 'Elite precision: +10% damage, but lighter armour (−8% HP).', damageMult: 1.10, hpMult: 0.92 },
  harkonnen: { id: 'harkonnen', name: 'Harkonnen', blurb: 'Brute resilience: +10% HP, but their guns hit softer (−8% damage).', damageMult: 0.92, hpMult: 1.10 },
};

// ---- Armor & damage types (rock-paper-scissors combat) -------------------------------------
// Every unit has an `armor` class; every weapon has a damage `type`. Dealt damage is scaled by
// DAMAGE_VS_ARMOR[type][armor] (default 1.0). This is the classic Westwood counter system: guns
// shred infantry but bounce off tanks, rockets punch armour and aircraft, shells flatten
// infantry but struggle vs heavies. Buildings use the 'building' class (always ~1.0) so the
// pace of base-razing is unaffected by unit-vs-unit tuning.
export type ArmorClass = 'light' | 'medium' | 'heavy' | 'air' | 'building';
export type DamageType = 'gun' | 'cannon' | 'rocket' | 'shell';

export const DAMAGE_VS_ARMOR: Record<DamageType, Record<ArmorClass, number>> = {
  // type      light  medium  heavy   air    building
  gun:    { light: 1.15, medium: 1.0,  heavy: 0.75, air: 0.45, building: 1.0 },
  cannon: { light: 1.0,  medium: 1.05, heavy: 1.0,  air: 0.55, building: 1.0 },
  rocket: { light: 0.85, medium: 1.0,  heavy: 1.4,  air: 1.4,  building: 1.0 },
  shell:  { light: 1.4,  medium: 1.15, heavy: 0.7,  air: 0.0,  building: 1.0 },
};

export function damageMultiplier(type: DamageType, armor: ArmorClass): number {
  return DAMAGE_VS_ARMOR[type][armor] ?? 1.0;
}

export interface WeaponDef {
  damage: number;
  range: number;          // px
  cooldown: number;       // seconds between shots
  projectileSpeed: number; // px/sec (high = bullet-like; instant-ish)
  type: DamageType;       // keys DAMAGE_VS_ARMOR for the rock-paper-scissors multiplier
  canTargetAir?: boolean; // may engage flying units (default false: most ground weapons can't)
  minRange?: number;      // px: cannot fire closer than this (artillery); kites away if breached
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
  unlocksUpgrades?: boolean; // hosts the upgrades panel (Radar = the tech building)
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
  armor: ArmorClass;      // how incoming damage types are scaled against this unit
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
    maxHp: 450, power: -40, requires: ['refinery'], sight: 9, unlocksUpgrades: true,
    color: '#4a6a7a', trim: '#2f424d',
  },
  turret: {
    id: 'turret', name: 'Gun Turret', w: 1, h: 1, cost: 200, buildTime: 4,
    maxHp: 620, power: -20, requires: ['power'], sight: 6,
    // Defensive cannon that can also plink aircraft (base AA), but a dedicated Rocket
    // Trooper is the real anti-air answer.
    weapon: { damage: 26, range: 170, cooldown: 1.0, projectileSpeed: 420, type: 'cannon', canTargetAir: true, color: '#ffd27a' },
    color: '#6b6b75', trim: '#3d3d45',
  },
  rocketturret: {
    id: 'rocketturret', name: 'Rocket Turret', w: 1, h: 1, cost: 400, buildTime: 6,
    maxHp: 520, power: -30, requires: ['radar'], sight: 7,
    // Dedicated anti-armour defence: rocket damage (1.4× vs heavy/air), splash, and longer range
    // than the Gun Turret so it can outrange attacking tanks. The real answer to armour pushes.
    weapon: { damage: 30, range: 200, cooldown: 1.7, projectileSpeed: 360, type: 'rocket', canTargetAir: true, splash: 18, color: '#ffb36a' },
    color: '#6b5a55', trim: '#3d322f',
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
  'power', 'refinery', 'barracks', 'turret', 'radar', 'rocketturret', 'factory', 'helipad',
];

// ---- Units --------------------------------------------------------------------------------
export const UNITS: Record<string, UnitDef> = {
  infantry: {
    id: 'infantry', name: 'Light Infantry', kind: 'infantry', cost: 90, buildTime: 3.5,
    maxHp: 95, speed: 52, sight: 5, radius: 6, builtAt: 'barracks', armor: 'light',
    weapon: { damage: 14, range: 115, cooldown: 0.85, projectileSpeed: 460, type: 'gun', color: '#fff3c2' },
    color: '#c95b4a', trim: '#7a2f24',
  },
  rocket: {
    // The cheap anti-armour / anti-air answer. Slow and soft, but its rockets melt tanks and
    // are the only infantry that can hit the Ornithopter.
    id: 'rocket', name: 'Rocket Trooper', kind: 'infantry', cost: 130, buildTime: 4.5,
    maxHp: 80, speed: 46, sight: 6, radius: 6, builtAt: 'barracks', armor: 'light',
    weapon: { damage: 20, range: 140, cooldown: 1.5, projectileSpeed: 360, type: 'rocket', canTargetAir: true, color: '#ffb36a' },
    color: '#b5743a', trim: '#6e431d',
  },
  harvester: {
    id: 'harvester', name: 'Harvester', kind: 'vehicle', cost: 350, buildTime: 7,
    maxHp: 320, speed: 110, sight: 4, radius: 11, builtAt: 'factory', harvester: true, armor: 'medium',
    color: '#caa84a', trim: '#7a5a1e',
  },
  scout: {
    // Fast, fragile recon/harasser. High sight, cheap, shreds infantry but folds to armour.
    id: 'scout', name: 'Recon Buggy', kind: 'vehicle', cost: 130, buildTime: 5,
    maxHp: 90, speed: 135, sight: 8, radius: 8, builtAt: 'factory', armor: 'light',
    weapon: { damage: 10, range: 105, cooldown: 0.55, projectileSpeed: 480, type: 'gun', color: '#fff3c2' },
    color: '#5fa0a8', trim: '#356066',
  },
  tank: {
    id: 'tank', name: 'Battle Tank', kind: 'vehicle', cost: 450, buildTime: 8,
    maxHp: 340, speed: 68, sight: 6, radius: 11, builtAt: 'factory', armor: 'heavy',
    weapon: { damage: 38, range: 155, cooldown: 1.6, projectileSpeed: 340, type: 'cannon', splash: 22, color: '#ffd27a' },
    color: '#8a7a4a', trim: '#544a2f',
  },
  artillery: {
    // Long-range siege with splash; devastating vs massed infantry and great for cracking
    // turret lines, but helpless point-blank (min range) and weak armour.
    id: 'artillery', name: 'Artillery', kind: 'vehicle', cost: 320, buildTime: 9,
    maxHp: 110, speed: 44, sight: 7, radius: 11, builtAt: 'factory', armor: 'light',
    weapon: { damage: 40, range: 230, cooldown: 2.6, projectileSpeed: 300, type: 'shell', minRange: 90, splash: 34, color: '#ffe08a' },
    color: '#9a8a5a', trim: '#5c5230',
  },
  aircraft: {
    id: 'aircraft', name: 'Ornithopter', kind: 'aircraft', cost: 600, buildTime: 9,
    maxHp: 150, speed: 175, sight: 7, radius: 9, builtAt: 'helipad', flying: true, armor: 'air',
    weapon: { damage: 26, range: 140, cooldown: 1.0, projectileSpeed: 520, type: 'gun', color: '#fff3c2' },
    color: '#6a6ab5', trim: '#39395a',
  },
};

// Which unit each producing building offers (menu order).
export const UNIT_MENU: Record<ProduceKind, string[]> = {
  building: [],
  infantry: ['infantry', 'rocket'],
  vehicle: ['harvester', 'scout', 'tank', 'artillery'],
  aircraft: ['aircraft'],
};

// ---- Upgrades -------------------------------------------------------------------------------
// One-time global purchases unlocked by the Radar Outpost (the tech building). Each sets a
// permanent multiplier on the owning faction, applied instantly to every current and future
// unit. A pure credit sink that rewards a strong economy with a strictly better army.
export type UpgradeEffect = 'damageMult' | 'vehicleHpMult' | 'vehicleSpeedMult' | 'harvestMult';

export interface UpgradeDef {
  id: string;
  name: string;
  short: string;          // compact label for the sidebar icon
  cost: number;
  requires: string;       // building id that must be owned to purchase
  effect: UpgradeEffect;
  value: number;          // the multiplier this upgrade grants
  desc: string;
}

export const UPGRADES: Record<string, UpgradeDef> = {
  depleted_rounds: {
    id: 'depleted_rounds', name: 'Depleted Rounds', short: 'DMG +15%', cost: 600,
    requires: 'radar', effect: 'damageMult', value: 1.15,
    desc: '+15% weapon damage for all units.',
  },
  composite_armor: {
    id: 'composite_armor', name: 'Composite Armor', short: 'VEH HP +25%', cost: 700,
    requires: 'radar', effect: 'vehicleHpMult', value: 1.25,
    desc: '+25% HP for all vehicles.',
  },
  turbo_drives: {
    id: 'turbo_drives', name: 'Turbo Drives', short: 'VEH SPD +15%', cost: 450,
    requires: 'radar', effect: 'vehicleSpeedMult', value: 1.15,
    desc: '+15% movement speed for all vehicles.',
  },
  salvage_logistics: {
    id: 'salvage_logistics', name: 'Salvage Logistics', short: 'HARVEST +25%', cost: 500,
    requires: 'radar', effect: 'harvestMult', value: 1.25,
    desc: '+25% spice mined per trip.',
  },
};

export const UPGRADE_ORDER = [
  'depleted_rounds', 'composite_armor', 'turbo_drives', 'salvage_logistics',
];
