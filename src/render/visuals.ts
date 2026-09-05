// Testable terrain palettes + per-unit-type silhouette recipes. The renderer paints with these;
// node checks import this module (no Vite glob, no browser canvas required).

import { Terrain } from '../world/tilemap';
import { UNITS } from '../world/defs';
import type { Faction, House } from '../world/defs';
import { WORM_RADIUS } from '../world/constants';

export const PLAYER_COLOR = '#46d46e';
export const ENEMY_COLOR = '#e0524a';

/** House paint on the hull — affiliation is readable in a group, not only a 2px pip. */
export const HOUSE_BODY: Record<House, string> = {
  atreides: '#3d7ec4',
  harkonnen: '#c44a3a',
};

const SAND_FILLS = [
  '#c8a45c', '#c2a058', '#b89550', '#d0ae6a',
  '#ba9a4c', '#c9ab62', '#b38d48', '#cdb46e',
];
const SAND_ACCENT = [
  '#a88840', '#9a7c38', '#d4b878', '#8e7030',
  '#c4a060', '#ae8c44', '#dcc080', '#967834',
];
const ROCK_FILLS = ['#6b5d44', '#5e5340', '#74664c', '#4f4636', '#7a6b52', '#635844'];
const ROCK_ACCENT = ['#4a4030', '#3e3628', '#8a7a5c', '#2e2820', '#9a8a68', '#524838'];
const SPICE_FILLS = ['#d8742a', '#e07e32', '#c86a24', '#d06822'];
const SPICE_RICH = ['#a8481a', '#b85020', '#9a4016', '#c05822'];
const SPICE_BLOOM = ['#f0a040', '#e89030', '#ffb050', '#d87828'];

/** Integer mix — not `(tx+ty)%2`. */
export function hash2(tx: number, ty: number): number {
  let n = Math.imul(tx | 0, 374761393) + Math.imul(ty | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return n >>> 0;
}

export function terrainVariant(tx: number, ty: number, modulo: number): number {
  return hash2(tx, ty) % modulo;
}

export function terrainFillStyle(terrain: Terrain, tx: number, ty: number, spice = 0): string {
  if (terrain === Terrain.Rock) return ROCK_FILLS[terrainVariant(tx, ty, ROCK_FILLS.length)];
  if (terrain === Terrain.Spice) {
    const pal = spice > 500 ? SPICE_RICH : SPICE_FILLS;
    return pal[terrainVariant(tx, ty, pal.length)];
  }
  return SAND_FILLS[terrainVariant(tx, ty, SAND_FILLS.length)];
}

export function terrainAccent(terrain: Terrain, tx: number, ty: number, spice = 0): string {
  if (terrain === Terrain.Rock) return ROCK_ACCENT[terrainVariant(tx, ty, ROCK_ACCENT.length)];
  if (terrain === Terrain.Spice) {
    const bloom = spice > 500 ? SPICE_BLOOM : SPICE_FILLS;
    return bloom[terrainVariant(tx + 3, ty + 1, bloom.length)];
  }
  return SAND_ACCENT[terrainVariant(tx, ty, SAND_ACCENT.length)];
}

export type TerrainDetail = 'grain' | 'facet' | 'bloom';

export function terrainDetailKind(terrain: Terrain): TerrainDetail {
  if (terrain === Terrain.Rock) return 'facet';
  if (terrain === Terrain.Spice) return 'bloom';
  return 'grain';
}

export function ownerBodyFill(_owner: Faction, house: House): string {
  return HOUSE_BODY[house];
}

export function ownerAccent(owner: Faction, localFaction: Faction): string {
  return owner === localFaction ? PLAYER_COLOR : ENEMY_COLOR;
}

/** Minimal 2D surface used by the painters (real canvas or a recording stub). */
export interface Draw2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean): void;
}

export interface TileNeighbors {
  n: number;
  e: number;
  s: number;
  w: number;
}

/** Base fill + intra-tile detail + a darker seam when a neighbor is a different terrain. */
export function paintTerrainTile(
  ctx: Draw2D,
  terrain: Terrain,
  tx: number,
  ty: number,
  spice: number,
  sx: number,
  sy: number,
  tileSize: number,
  neighbors?: TileNeighbors,
): void {
  const fill = terrainFillStyle(terrain, tx, ty, spice);
  const accent = terrainAccent(terrain, tx, ty, spice);
  ctx.fillStyle = fill;
  ctx.fillRect(sx, sy, tileSize, tileSize);

  const h = hash2(tx, ty);
  const kind = terrainDetailKind(terrain);
  if (kind === 'grain') {
    // Dune ripples — several hash-placed strips so a tile is not a flat checker square.
    ctx.fillStyle = accent;
    const ox = (h & 15);
    ctx.fillRect(sx + ox, sy + 5 + (h >>> 4) % 7, 11 + (h >>> 8) % 8, 1);
    ctx.fillRect(sx + ((h >>> 12) & 15), sy + 14 + ((h >>> 16) % 6), 9 + ((h >>> 20) % 7), 1);
    ctx.fillRect(sx + 3 + ((h >>> 24) & 11), sy + 23, 10, 1);
  } else if (kind === 'facet') {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(sx + tileSize * 0.15, sy);
    ctx.lineTo(sx + tileSize, sy + tileSize * 0.25);
    ctx.lineTo(sx + tileSize * 0.55, sy + tileSize);
    ctx.lineTo(sx, sy + tileSize * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(sx + tileSize * 0.45, sy + tileSize * 0.15);
    ctx.lineTo(sx + tileSize * 0.9, sy + tileSize * 0.4);
    ctx.lineTo(sx + tileSize * 0.35, sy + tileSize * 0.85);
    ctx.closePath();
    ctx.fill();
  } else {
    const cx = sx + tileSize * 0.5 + ((h & 7) - 3);
    const cy = sy + tileSize * 0.5 + (((h >>> 3) & 7) - 3);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, cy, 5 + (h >>> 6) % 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spice > 500 ? '#ffc060' : '#e89838';
    ctx.fillRect(sx + 4 + (h & 7), sy + 6, 2, 2);
    ctx.fillRect(sx + 18 + ((h >>> 8) & 7), sy + 20, 2, 2);
    ctx.fillRect(sx + 12 + ((h >>> 16) & 5), sy + 10, 2, 2);
  }

  if (neighbors) {
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    if (neighbors.w !== terrain) ctx.fillRect(sx, sy, 2, tileSize);
    if (neighbors.n !== terrain) ctx.fillRect(sx, sy, tileSize, 2);
    if (neighbors.e !== terrain) ctx.fillRect(sx + tileSize - 2, sy, 2, tileSize);
    if (neighbors.s !== terrain) ctx.fillRect(sx, sy + tileSize - 2, tileSize, 2);
  }
}

export type UnitShapeKind =
  | 'trooper'
  | 'rocketeer'
  | 'buggy'
  | 'harvester'
  | 'tank'
  | 'artillery'
  | 'ornithopter';

export interface UnitShapeRecipe {
  id: string;
  kind: UnitShapeKind;
  hullW: number;
  hullH: number;
  hasBarrel: boolean;
  hasTurret: boolean;
  hasWings: boolean;
  hasPack: boolean;
  hasWheels: boolean;
  hasHopper: boolean;
}

const SHAPES: Record<string, UnitShapeRecipe> = {
  infantry: {
    id: 'infantry', kind: 'trooper', hullW: 0.7, hullH: 1.15,
    hasBarrel: false, hasTurret: false, hasWings: false, hasPack: false, hasWheels: false, hasHopper: false,
  },
  rocket: {
    id: 'rocket', kind: 'rocketeer', hullW: 0.7, hullH: 1.15,
    hasBarrel: false, hasTurret: false, hasWings: false, hasPack: true, hasWheels: false, hasHopper: false,
  },
  scout: {
    id: 'scout', kind: 'buggy', hullW: 1.7, hullH: 1.05,
    hasBarrel: true, hasTurret: false, hasWings: false, hasPack: false, hasWheels: true, hasHopper: false,
  },
  harvester: {
    id: 'harvester', kind: 'harvester', hullW: 2.05, hullH: 1.55,
    hasBarrel: false, hasTurret: false, hasWings: false, hasPack: false, hasWheels: false, hasHopper: true,
  },
  tank: {
    id: 'tank', kind: 'tank', hullW: 1.85, hullH: 1.4,
    hasBarrel: true, hasTurret: true, hasWings: false, hasPack: false, hasWheels: false, hasHopper: false,
  },
  artillery: {
    id: 'artillery', kind: 'artillery', hullW: 1.35, hullH: 1.05,
    hasBarrel: true, hasTurret: false, hasWings: false, hasPack: false, hasWheels: false, hasHopper: false,
  },
  aircraft: {
    id: 'aircraft', kind: 'ornithopter', hullW: 0.85, hullH: 1.85,
    hasBarrel: false, hasTurret: false, hasWings: true, hasPack: false, hasWheels: false, hasHopper: false,
  },
};

export function unitShape(defId: string): UnitShapeRecipe {
  return SHAPES[defId] ?? SHAPES.infantry;
}

export function allUnitShapeIds(): string[] {
  return Object.keys(SHAPES);
}

/** Roster ids that must each have their own recipe (kept in lockstep with `UNITS`). */
export function rosterUnitIds(): string[] {
  return Object.keys(UNITS);
}

export interface UnitPaintExtras {
  loadFrac?: number;
  muzzle?: boolean;
}

/**
 * Draw a unit body in local space (caller already translated to the unit and rotated to facing).
 * Distinct path per `recipe.kind` — not a shared triangle.
 */
export function paintUnitBody(
  ctx: Draw2D,
  recipe: UnitShapeRecipe,
  r: number,
  fill: string,
  accent: string,
  extras: UnitPaintExtras = {},
): void {
  const hw = r * recipe.hullW;
  const hh = r * recipe.hullH;
  ctx.fillStyle = fill;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;

  switch (recipe.kind) {
    case 'trooper': {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.5, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d4c49a';
      ctx.beginPath();
      ctx.arc(r * 0.4, 0, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'rocketeer': {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.5, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d4c49a';
      ctx.beginPath();
      ctx.arc(r * 0.4, 0, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2e2e36';
      ctx.fillRect(-r * 1.15, -r * 0.38, r * 0.7, r * 0.76);
      ctx.fillStyle = '#8a6230';
      ctx.fillRect(-r * 1.35, -r * 0.16, r * 1.05, r * 0.32);
      break;
    }
    case 'buggy': {
      ctx.fillStyle = '#2a2a28';
      ctx.fillRect(-hw * 0.35, -hh * 0.72, hw * 0.32, hh * 0.28);
      ctx.fillRect(-hw * 0.35, hh * 0.44, hw * 0.32, hh * 0.28);
      ctx.fillRect(hw * 0.08, -hh * 0.72, hw * 0.32, hh * 0.28);
      ctx.fillRect(hw * 0.08, hh * 0.44, hw * 0.32, hh * 0.28);
      ctx.fillStyle = fill;
      ctx.fillRect(-hw * 0.45, -hh * 0.42, hw * 0.95, hh * 0.84);
      ctx.strokeStyle = accent;
      ctx.strokeRect(-hw * 0.45, -hh * 0.42, hw * 0.95, hh * 0.84);
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(hw * 0.38, -1.5, r * 0.55, 3);
      break;
    }
    case 'harvester': {
      ctx.fillRect(-hw * 0.5, -hh * 0.5, hw, hh);
      ctx.strokeRect(-hw * 0.5, -hh * 0.5, hw, hh);
      const load = Math.max(0, Math.min(1, extras.loadFrac ?? 0));
      const hop = hh * 0.72 * load;
      ctx.fillStyle = '#d8742a';
      ctx.fillRect(-hw * 0.38, hh * 0.42 - hop, hw * 0.76, hop);
      ctx.fillStyle = shadeHex(fill, 0.7);
      ctx.fillRect(hw * 0.12, -hh * 0.28, hw * 0.32, hh * 0.56);
      break;
    }
    case 'tank': {
      ctx.beginPath();
      ctx.moveTo(hw * 0.48, -hh * 0.42);
      ctx.lineTo(hw * 0.48, hh * 0.42);
      ctx.lineTo(-hw * 0.5, hh * 0.5);
      ctx.lineTo(-hw * 0.5, -hh * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = shadeHex(fill, 0.72);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(r * 0.28, -2, r * 0.95, 4);
      break;
    }
    case 'artillery': {
      ctx.fillRect(-hw * 0.55, -hh * 0.48, hw * 0.85, hh * 0.96);
      ctx.strokeRect(-hw * 0.55, -hh * 0.48, hw * 0.85, hh * 0.96);
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(-r * 0.15, -2.4, r * 1.7, 4.8);
      break;
    }
    case 'ornithopter': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 1.35);
      ctx.lineTo(r * 0.55, 0);
      ctx.lineTo(-r * 0.15, r * 1.35);
      ctx.lineTo(-r * 0.7, r * 0.35);
      ctx.lineTo(-r * 0.7, -r * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = shadeHex(fill, 0.85);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  if (extras.muzzle) {
    ctx.fillStyle = 'rgba(255,235,150,0.9)';
    ctx.beginPath();
    ctx.arc(r + 3, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return hex;
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ---- Sandworm painters ------------------------------------------------------------------------
// Same convention as paintUnitBody: the caller has already translated to the head position and
// rotated so local +x points along the worm's facing. Draw2D has no gradient/scale/rotate methods,
// so the "radial gradient" maw and the rise/fall scale are both faked with plain circles and
// hand-scaled numbers rather than ctx.createRadialGradient / ctx.scale.

const WORM_HIDE = '#9c7a45';
const WORM_HIDE_DARK = '#6b5030';
const WORM_HIDE_LIGHT = '#b08c54';
const WORM_TOOTH = '#eee3c8';
const WORM_RING_FRACS = [0.86, 0.66, 0.46]; // hoisted: no per-call array allocation

export type WormPaintPhase = 'sign' | 'surfaced';

export interface WormPaintOptions {
  phase: WormPaintPhase;
  t: number;         // world.time — animation clock (never Date.now/performance.now)
  seed: number;       // per-worm id: deterministic per-worm variety (never Math.random)
  urgent?: boolean;   // phase 'sign': hunting (vs roaming) — faster ripple, a bit bigger, dust
  scale?: number;     // phase 'surfaced': 0 (submerged) .. 1 (fully risen)
  sway?: number;      // phase 'surfaced': extra lateral offset in px (devouring shiver)
}

/**
 * Draw a sandworm in local space (see convention note above). `phase: 'sign'` draws the
 * underground wormsign disturbance; `phase: 'surfaced'` draws the risen body.
 */
export function paintWorm(ctx: Draw2D, opts: WormPaintOptions): void {
  if (opts.phase === 'sign') {
    paintWormSign(ctx, opts.t, opts.seed, !!opts.urgent);
    return;
  }
  paintWormBody(ctx, opts.t, opts.seed, opts.scale ?? 1, opts.sway ?? 0);
}

function paintWormSign(ctx: Draw2D, t: number, seed: number, urgent: boolean): void {
  const rate = urgent ? 5.5 : 2.6;
  const phase0 = (hash2(seed, 0) % 1000) / 1000 * Math.PI * 2;
  const pulse = 1 + (urgent ? 0.1 : 0.06) * Math.sin(t * rate + phase0);
  const scale = urgent ? 1.12 : 1;

  // Trailing mounds (drawn first, so the head ridge overlaps them) — approximated straight
  // behind the head along -facing since there is no path-history buffer to trail along.
  const mounds = urgent ? 4 : 3;
  for (let i = mounds; i >= 1; i--) {
    const h = hash2(seed, i);
    const jitter = (h % 9) - 4;                              // -4..4 px lateral wobble
    const wobble = Math.sin(t * (rate * 0.7) + (h % 7)) * 1.5;
    const dx = -(16 + i * 13) * scale;
    const dy = (jitter + wobble) * scale;
    const rx = Math.max(2, (10 - i * 0.9) * scale);
    const ry = Math.max(1.5, (5.5 - i * 0.4) * scale);
    ctx.fillStyle = WORM_HIDE_DARK;
    ctx.beginPath();
    ctx.ellipse(dx, dy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WORM_HIDE;
    ctx.beginPath();
    ctx.ellipse(dx, dy - 0.6, Math.max(1.4, rx * 0.7), Math.max(1, ry * 0.6), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head ridge: a darker rim behind a lighter raised-sand ellipse, elongated along facing (+x).
  const rx = 21 * scale * pulse;
  const ry = 10 * scale * pulse;
  ctx.fillStyle = WORM_HIDE_DARK;
  ctx.beginPath();
  ctx.ellipse(1, 1, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = WORM_HIDE_LIGHT;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.86, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  if (urgent) { // faint kicked-up dust while hunting
    for (let i = 0; i < 4; i++) {
      const h = hash2(seed, i + 20);
      const ang = (h % 628) / 100;
      const dist = 8 + ((h >>> 6) % 14);
      const px = Math.cos(ang) * dist;
      const py = Math.sin(ang) * dist * 0.5;
      ctx.fillStyle = 'rgba(214,196,160,0.35)';
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintWormBody(ctx: Draw2D, t: number, seed: number, scale: number, sway: number): void {
  const s = Math.max(0, Math.min(1, scale));
  if (s <= 0.01) return; // fully submerged — nothing to paint
  const phase0 = (hash2(seed, 99) % 1000) / 1000 * Math.PI * 2;
  const throb = 1 + 0.015 * Math.sin(t * 10 + phase0); // subtle life-like pulse, never static
  const R = WORM_RADIUS * s * throb;
  const y0 = sway;

  // The hole it is rising out of.
  ctx.fillStyle = 'rgba(60,44,24,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, y0 + R * 0.15, R * 1.35, R * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Trailing body segments arcing out of the sand behind the head (-facing side).
  for (let i = 3; i >= 1; i--) {
    const h = hash2(seed, i + 40);
    const dx = -R * (0.85 + i * 0.62);
    const dy = y0 + R * (0.1 + i * 0.05) + ((h % 5) - 2) * 0.4;
    const r = R * (0.62 - i * 0.1);
    ctx.fillStyle = WORM_HIDE_DARK;
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WORM_HIDE;
    ctx.beginPath();
    ctx.arc(dx, dy - r * 0.15, r * 0.78, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head: big segmented ochre dome.
  ctx.fillStyle = WORM_HIDE;
  ctx.strokeStyle = WORM_HIDE_DARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, y0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = WORM_HIDE_DARK;
  ctx.lineWidth = Math.max(1, R * 0.05);
  for (const f of WORM_RING_FRACS) {
    ctx.beginPath();
    ctx.arc(0, y0, R * f, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Maw: concentric dark circles stand in for a radial gradient (Draw2D has no gradients).
  const mawR = R * 0.56;
  ctx.fillStyle = '#241408';
  ctx.beginPath(); ctx.arc(0, y0, mawR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#150b04';
  ctx.beginPath(); ctx.arc(0, y0, mawR * 0.68, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#020100';
  ctx.beginPath(); ctx.arc(0, y0, mawR * 0.38, 0, Math.PI * 2); ctx.fill();

  // Teeth: pale triangles ringed around the maw mouth.
  const teeth = 12;
  const toothLen = mawR * 0.42;
  const baseW = mawR * 0.22;
  ctx.fillStyle = WORM_TOOTH;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const nx = Math.cos(a), ny = Math.sin(a);
    const bx = nx * mawR, by = y0 + ny * mawR;
    const tanX = -ny, tanY = nx; // tangent direction — gives the tooth its base width
    ctx.beginPath();
    ctx.moveTo(bx - tanX * baseW * 0.5, by - tanY * baseW * 0.5);
    ctx.lineTo(bx + tanX * baseW * 0.5, by + tanY * baseW * 0.5);
    ctx.lineTo(bx - nx * toothLen, by - ny * toothLen);
    ctx.closePath();
    ctx.fill();
  }
}
