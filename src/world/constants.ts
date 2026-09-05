// Tunable constants for the simulation. Gameplay numbers live here, not scattered in systems.

export const TILE = 32;            // px per tile (CSS pixels) at zoom 1
export const MAP_W = 64;           // map width  in tiles
export const MAP_H = 64;           // map height in tiles

export const SIM_HZ = 60;          // fixed simulation steps per second

export const CAMERA_SPEED = 750;       // px/sec camera pan speed
export const EDGE_SCROLL_MARGIN = 16;  // px from the edge that triggers edge-scroll

export const SIDEBAR_W = 200;          // px width of the right-hand command sidebar

// --- Economy ---
export const HARVESTER_CAPACITY = 500; // spice units a harvester can carry
export const HARVEST_RATE = 260;       // spice mined per second while harvesting
export const HARVEST_LEASH = 4;        // tiles (~harvester sight): when a tile runs dry, keep
                                       // mining spice within this radius; else bank load + seek a new patch
export const UNLOAD_RATE = 900;        // spice unloaded per second at the refinery
export const SPICE_PER_CREDIT = 1.25;  // spice-to-credit conversion. Tuned with the smarter
                                       // (fuller-trip) harvesters: trims yield-per-load so the
                                       // economy tempo sits near the sim-verified ladder.
export const SPICE_PER_TILE = 1000;    // full spice content of a spice tile
export const STARTING_CREDITS = 2000;

// --- Power ---
// When demand exceeds supply, production speed scales down to this floor at worst.
export const MIN_POWER_FACTOR = 0.25;

// --- Combat / movement ---
export const ARRIVE_EPS = 2;           // px tolerance for "arrived at waypoint"
export const GUARD_LEASH = 5;          // tiles a Guard-stance unit will chase from its post
export const AGGRO_LEASH = 14;         // tiles an Aggressive-stance unit will roam to hunt
export const SEPARATION_RADIUS = 18;   // px: units gently push apart within this distance
export const SEPARATION_FORCE = 40;    // px/sec push strength
export const PROJECTILE_HIT_RADIUS = 7; // px: projectile considered to hit within this
export const CORPSE_TTL = 1.2;         // seconds an explosion/wreck mark lingers
export const ROCK_COVER_MULT = 0.75;   // infantry on a Rock tile take 25% less damage (cover —
                                       // ruined building footprints are rocked, so ruins count)

// --- Combat juice (cosmetic only — no sim/balance effect) ---
export const HIT_FLASH_TIME = 0.12;    // seconds a unit/building flashes white when hit
export const POPUP_TTL = 0.7;          // seconds a floating damage number lives
export const POPUP_RISE = 20;          // px a damage number drifts upward over its life

// --- Veterancy (per-unit rank from kills; deterministic, part of the sim) ---
// Rank is derived from a unit's UNIT-kill count (building kills earn nothing — no ranking up by
// razing structures): rank 1 at VET_THRESHOLDS[0] kills, rank 2 at [1].
// Each rank multiplies fire-time damage (VET_DMG_MULT) and derived maxHp (VET_HP_MULT). Index 0
// is rank 0 (no bonus). maxHp is ALWAYS re-derived from the base def × mults (never compounded),
// exactly like the house/upgrade stat pipeline; on rank-up the maxHp delta is added to current hp.
export const VET_THRESHOLDS = [4, 10];        // kills needed for rank 1, rank 2 (slower ranking:
                                              // 3/8 let the AI's reinforced assaults accumulate
                                              // ranked survivors and drifted Easy ~+15pp harder)
export const VET_DMG_MULT = [1, 1.1, 1.2];    // damage multiplier by rank (0/1/2)
export const VET_HP_MULT = [1, 1.1, 1.2];     // maxHp multiplier by rank (0/1/2)

// --- Repair (player utility: restore building HP for credits) ---
export const REPAIR_RATE = 90;         // building HP restored per second while repairing
export const REPAIR_COST_FACTOR = 0.45; // credits per restored HP, as a fraction of cost/maxHp
                                        // (so a full repair from 0 costs ~45% of the rebuild price)

// --- Fog of war ---
export const FOG_REFRESH = 0.25;       // seconds between visibility recomputes

// --- Sandworms (neutral hazards; deterministic, part of the sim — see world/worm.ts) ---
// A worm hunts VIBRATION on open sand: moving vehicles/harvesters (and mining harvesters) draw it,
// flyers and anything on Rock are immune (rocked building footprints count as Rock). Escort guns
// and turrets auto-fire at a surfaced worm; soaking WORM_REPEL_DAMAGE drives it back under.
export const WORM_ROAM_SPEED = 55;       // px/s cruising under the sand with no prey
export const WORM_HUNT_SPEED = 100;      // px/s closing on prey (a harvester at 110 can outrun it if it reacts)
export const WORM_SENSE_TILES = 14;      // tiles: vibration detection radius
export const WORM_THINK = 0.5;           // s between prey re-evaluations
export const WORM_HUNT_TIMEOUT = 22;     // s a single chase may last before the worm gives up
export const WORM_STRIKE_DIST = 18;      // px: head-under-prey distance that triggers surfacing
export const WORM_MAW_RADIUS = 30;       // px: every ground unit on sand within this is devoured at the bite
export const WORM_SURFACE_TIME = 1.0;    // s rising before the bite lands (the reaction window)
export const WORM_DEVOUR_TIME = 1.3;     // s the worm stays up chewing (still a target)
export const WORM_SUBMERGE_TIME = 0.8;   // s sinking back under
export const WORM_SATED_TIME = 45;       // s of calm roaming after a meal — the pacing lever
export const WORM_MISS_TIME = 8;         // s of calm after an empty bite
export const WORM_FLEE_TIME = 35;        // s of calm after being driven off by gunfire
export const WORM_REPEL_DAMAGE = 110;    // damage (vs heavy armour) absorbed while up that drives it under
                                         // (3 tanks or 3 rocket turrets in one volley cancel the bite)
export const WORM_ROAM_TILES = 12;       // tiles: max distance of a random roam goal
export const WORM_SPAWN_CLEAR = 10;      // tiles: min distance from any building at spawn
export const WORM_RADIUS = 26;           // px: draw/hit radius of the surfaced head
