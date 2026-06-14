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

// --- Combat juice (cosmetic only — no sim/balance effect) ---
export const HIT_FLASH_TIME = 0.12;    // seconds a unit/building flashes white when hit
export const POPUP_TTL = 0.7;          // seconds a floating damage number lives
export const POPUP_RISE = 20;          // px a damage number drifts upward over its life

// --- Fog of war ---
export const FOG_REFRESH = 0.25;       // seconds between visibility recomputes
