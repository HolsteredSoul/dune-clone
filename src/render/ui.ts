// Command sidebar (minimap + build menus), top resource bar, and mission overlays. The UI
// computes clickable rects while drawing and exposes hitTest() so the controller can route
// clicks back to world actions.

import type { World } from '../world/world';
import type { Camera } from '../core/camera';
import type { Unit } from '../world/unit';
import { BUILDINGS, UNITS, UPGRADES, BUILD_MENU_ORDER, UPGRADES_BY_TIER, STANCE_LABEL, DIFFICULTY, DIFFICULTY_ORDER, HOUSES, HOUSE_ORDER, otherHouse } from '../world/defs';
import type { Stance, Difficulty, House, Faction } from '../world/defs';
import { PERSONALITIES, PERSONALITY_ORDER } from '../world/ai';

/** A click on the brief screen's pickers (difficulty or house), or null for "begin". */
export type OverlayPick = { difficulty: Difficulty } | { house: House };
/** Current skirmish-setup selections, passed to drawSkirmish for active-state highlighting. */
export interface SkirmishSel { house: House; difficulty: Difficulty; ai: string; }
/** A click on the skirmish-setup screen. */
export type SkirmishPick =
  | { house: House } | { difficulty: Difficulty } | { ai: string } | { action: 'begin' | 'back' };
import { SIDEBAR_W, TILE, MAP_W, MAP_H } from '../world/constants';

const UNIT_ICON_ORDER = ['infantry', 'rocket', 'scout', 'harvester', 'tank', 'artillery', 'aircraft'];
const COMMANDS = [
  { cmd: 'attackmove', label: 'A-Move' },
  { cmd: 'stop', label: 'Stop' },
  { cmd: 'hold', label: 'Hold' },
  { cmd: 'guard', label: 'Guard' },
] as const;
const STANCES: Stance[] = ['aggressive', 'guard', 'holdground', 'holdfire'];

interface Rect { x: number; y: number; w: number; h: number; }
export type CommandKind = 'attackmove' | 'stop' | 'hold' | 'guard';
export type UiAction =
  | { type: 'structure'; id: string }
  | { type: 'unit'; id: string }
  | { type: 'upgrade'; id: string }
  | { type: 'minimap'; wx: number; wy: number }
  | { type: 'command'; cmd: CommandKind }
  | { type: 'stance'; stance: Stance }
  | { type: 'mute' }
  | { type: 'difficulty'; difficulty: Difficulty };

export type Overlay = 'none' | 'title' | 'skirmish' | 'brief' | 'paused' | 'won' | 'lost';

export class Ui {
  private structRects: { id: string; rect: Rect }[] = [];
  private unitRects: { id: string; rect: Rect }[] = [];
  private upgradeRects: { id: string; rect: Rect }[] = [];
  private cmdRects: { cmd: CommandKind; rect: Rect }[] = [];
  private stanceRects: { stance: Stance; rect: Rect }[] = [];
  private diffRects: { d: Difficulty; rect: Rect }[] = [];
  private houseRects: { h: House; rect: Rect }[] = [];
  private titleRects: { id: string; rect: Rect }[] = [];
  private pauseRects: { id: string; rect: Rect }[] = [];
  private aiRects: { id: string; rect: Rect }[] = [];
  private skActionRects: { action: 'begin' | 'back'; rect: Rect }[] = [];
  private minimap: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private muteRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private screenW = 0;
  private screenH = 0;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  get sidebarX(): number { return this.screenW - SIDEBAR_W; }

  /** The faction this client controls/views: drives the top bar + sidebar (its credits / build
   *  menu / queues / upgrades) and the minimap colors. 'player' for single-player + the MP host;
   *  'enemy' for a MP guest. The default keeps single-player byte-identical. */
  private localFaction: Faction = 'player';

  draw(world: World, cam: Camera, screenW: number, screenH: number, overlay: Overlay,
       selUnits: Unit[], difficulty: Difficulty, muted: boolean, toast: string | null = null,
       hasSave = false, skirmishSel: SkirmishSel | null = null, localFaction: Faction = 'player'): void {
    this.localFaction = localFaction;
    this.screenW = screenW;
    this.screenH = screenH;
    this.drawTopBar(world, muted);
    this.drawSidebar(world, cam);
    this.cmdRects = [];
    this.stanceRects = [];
    this.diffRects = [];
    this.houseRects = [];
    this.titleRects = [];
    this.pauseRects = [];
    this.aiRects = [];
    this.skActionRects = [];
    if (overlay === 'none' && selUnits.length > 0) this.drawCommandBar(selUnits);
    if (overlay !== 'none') this.drawOverlay(world, overlay, difficulty, hasSave, skirmishSel);
    if (toast) this.drawToast(toast);
  }

  private drawToast(msg: string): void {
    const ctx = this.ctx;
    const w = this.screenW - SIDEBAR_W;
    ctx.font = 'bold 14px monospace';
    const tw = ctx.measureText(msg).width + 28;
    const x = (w - tw) / 2, y = 36;
    ctx.fillStyle = 'rgba(12,14,18,0.9)';
    ctx.fillRect(x, y, tw, 26);
    ctx.strokeStyle = '#7fe39a';
    ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, 25);
    ctx.fillStyle = '#d8ffe2';
    ctx.textAlign = 'center';
    ctx.fillText(msg, w / 2, y + 17);
    ctx.textAlign = 'left';
  }

  private drawTopBar(world: World, muted: boolean): void {
    const ctx = this.ctx;
    const w = this.screenW - SIDEBAR_W;
    ctx.fillStyle = 'rgba(10,12,16,0.85)';
    ctx.fillRect(0, 0, w, 26);
    const power = world.powerInfo(this.localFaction);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#ffd479';
    ctx.fillText(`⬡ ${Math.floor(world.player_(this.localFaction).credits)}`, 12, 18);
    ctx.fillStyle = power.factor < 1 ? '#e0524a' : '#7fd0ff';
    ctx.fillText(`⚡ ${power.produced}/${power.consumed}`, 140, 18);
    if (power.factor < 1) {
      ctx.fillStyle = '#e0524a';
      ctx.fillText('LOW POWER', 280, 18);
    }
    // Countdown for timed objectives (survive / defend) — the player needs to see the clock.
    const obj = world.config.objective;
    if (obj && obj.timeLimit && world.result === 'playing') {
      const rem = Math.max(0, Math.ceil(obj.timeLimit - world.time));
      const label = (obj.kind === 'defend' ? 'DEFEND ' : 'HOLD ')
        + Math.floor(rem / 60) + ':' + String(rem % 60).padStart(2, '0');
      ctx.fillStyle = rem <= 30 ? '#ff8a82' : '#7fe39a';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(label, 410, 18);
    }
    // Player's house identity (faction asymmetry), right-aligned just left of the mute toggle.
    ctx.fillStyle = '#9fb6c9';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(HOUSES[world.player_(this.localFaction).house].name, w - 38, 18);
    ctx.textAlign = 'left';
    this.muteRect = { x: w - 30, y: 4, w: 22, h: 18 };
    this.drawSpeaker(this.muteRect, muted);
  }

  /** A small procedural speaker glyph in the top bar — a clickable mute toggle ('M' key too). */
  private drawSpeaker(r: Rect, muted: boolean): void {
    const ctx = this.ctx;
    const cx = r.x + 6, cy = r.y + r.h / 2;
    const on = !muted;
    ctx.fillStyle = on ? '#7fd0ff' : '#5a6470';
    ctx.strokeStyle = on ? '#7fd0ff' : '#5a6470';
    ctx.lineWidth = 1.5;
    // speaker body (square) + cone (triangle)
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3);
    ctx.lineTo(cx + 4, cy - 3);
    ctx.lineTo(cx + 8, cy - 6);
    ctx.lineTo(cx + 8, cy + 6);
    ctx.lineTo(cx + 4, cy + 3);
    ctx.lineTo(cx, cy + 3);
    ctx.closePath();
    ctx.fill();
    if (on) {
      // two sound waves
      ctx.beginPath();
      ctx.arc(cx + 8, cy, 5, -0.7, 0.7);
      ctx.moveTo(cx + 8, cy - 8);
      ctx.arc(cx + 8, cy, 8, -0.7, 0.7);
      ctx.stroke();
    } else {
      // red strike-through for muted
      ctx.strokeStyle = '#e0524a';
      ctx.beginPath();
      ctx.moveTo(cx + 1, cy - 7);
      ctx.lineTo(cx + 15, cy + 7);
      ctx.stroke();
    }
  }

  private drawSidebar(world: World, cam: Camera): void {
    const ctx = this.ctx;
    const x = this.sidebarX;
    ctx.fillStyle = '#16181d';
    ctx.fillRect(x, 0, SIDEBAR_W, this.screenH);
    ctx.strokeStyle = '#2a2e36';
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, this.screenH);
    ctx.stroke();

    // minimap
    const mm = SIDEBAR_W - 16;
    this.minimap = { x: x + 8, y: 8, w: mm, h: mm };
    this.drawMinimap(world, cam);

    let y = this.minimap.y + this.minimap.h + 10;
    y = this.section('STRUCTURES', y);
    this.structRects = [];
    y = this.iconGrid(BUILD_MENU_ORDER, y, (id) => this.structState(world, id), this.structRects);

    y += 6;
    y = this.section('UNITS', y);
    this.unitRects = [];
    const unitIds = UNIT_ICON_ORDER.filter((id) => world.ownedTypes(this.localFaction).has(UNITS[id].builtAt));
    y = this.iconGrid(unitIds, y, (id) => this.unitState(world, id), this.unitRects);

    // Upgrades — appear once the player owns the tech building (Radar). Rendered tier-by-tier;
    // only nodes whose prerequisite building is owned are shown, so the tree reveals as you tech up.
    this.upgradeRects = [];
    if (world.ownedTypes(this.localFaction).has('radar')) {
      y += 6;
      y = this.section('UPGRADES', y);
      for (const tier of [1, 2, 3]) {
        const ids = UPGRADES_BY_TIER[tier].filter(
          (id) => world.ownedTypes(this.localFaction).has(UPGRADES[id].requires));
        if (ids.length === 0) continue;
        y = this.section(`TIER ${tier}`, y);
        y = this.iconGrid(ids, y, (id) => this.upgradeState(world, id), this.upgradeRects);
      }
    }
  }

  private section(title: string, y: number): number {
    const ctx = this.ctx;
    ctx.fillStyle = '#8a929c';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(title, this.sidebarX + 10, y + 10);
    return y + 18;
  }

  private iconGrid(ids: string[], startY: number,
    state: (id: string) => IconState, out: { id: string; rect: Rect }[]): number {
    const ctx = this.ctx;
    const cols = 2;
    const pad = 8;
    const iw = (SIDEBAR_W - pad * (cols + 1)) / cols;
    const ih = 42;
    let y = startY;
    ids.forEach((id, i) => {
      const col = i % cols;
      const x = this.sidebarX + pad + col * (iw + pad);
      if (col === 0 && i > 0) y += ih + pad;
      const rect = { x, y, w: iw, h: ih };
      out.push({ id, rect });
      this.drawIcon(ctx, rect, state(id));
    });
    return y + ih + pad;
  }

  private drawIcon(ctx: CanvasRenderingContext2D, r: Rect, s: IconState): void {
    ctx.fillStyle = s.color;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = s.owned ? '#7fe39a' : s.ready ? '#ffd479' : s.enabled ? '#5a6470' : '#2a2e36';
    ctx.lineWidth = s.ready || s.owned ? 2 : 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    if (s.progress > 0 && s.progress < 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(r.x, r.y + r.h * (1 - s.progress), r.w, r.h * s.progress);
    }
    ctx.fillStyle = s.enabled || s.progress > 0 || s.owned ? '#e8edf2' : '#5a6470';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(s.label.slice(0, 11), r.x + 4, r.y + 14);
    if (!s.owned) {
      ctx.font = '9px monospace';
      ctx.fillStyle = '#cbb06a';
      ctx.fillText(`$${s.cost}`, r.x + 4, r.y + 27);
    }
    if (s.owned) {
      ctx.fillStyle = '#7fe39a';
      ctx.font = '9px monospace';
      ctx.fillText('OWNED', r.x + 4, r.y + 38);
    } else if (s.ready) {
      ctx.fillStyle = '#ffd479';
      ctx.fillText('READY', r.x + 4, r.y + 38);
    } else if (s.queue > 1) {
      ctx.fillStyle = '#e8edf2';
      ctx.fillText(`x${s.queue}`, r.x + r.w - 22, r.y + 38);
    }
  }

  private structState(world: World, id: string): IconState {
    const def = BUILDINGS[id];
    const p = world.player_(this.localFaction);
    const building = p.building?.defId === id ? p.building.progress : 0;
    const ready = p.ready === id;
    return {
      label: def.name, cost: def.cost, color: def.color,
      enabled: ready || world.canStartBuilding(this.localFaction, id),
      ready, progress: building, queue: 0,
    };
  }

  private unitState(world: World, id: string): IconState {
    const def = UNITS[id];
    const q = world.player_(this.localFaction).unitQueues.get(def.builtAt) ?? [];
    const mine = q.filter((it) => it.defId === id);
    const head = q[0]?.defId === id ? q[0].progress : 0;
    return {
      label: def.name, cost: def.cost, color: def.color,
      enabled: world.canQueueUnit(this.localFaction, id),
      ready: false, progress: head, queue: mine.length,
    };
  }

  private upgradeState(world: World, id: string): IconState {
    const def = UPGRADES[id];
    const owned = world.player_(this.localFaction).upgrades.has(id);
    // Dim a node whose tech prerequisite (building or prior upgrade) isn't met yet — it reads as
    // locked rather than merely unaffordable.
    const locked = !owned && !world.upgradePrereqsMet(this.localFaction, id);
    return {
      label: def.short, cost: def.cost, color: locked ? '#23283a' : '#39476a',
      enabled: world.canPurchaseUpgrade(this.localFaction, id),
      ready: false, progress: 0, queue: 0, owned,
    };
  }

  private drawMinimap(world: World, cam: Camera): void {
    const ctx = this.ctx;
    const { x, y, w, h } = this.minimap;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
    const sx = w / MAP_W, sy = h / MAP_H;
    const map = world.map;
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (!world.fog.explored(tx, ty)) continue;
        const i = map.idx(tx, ty);
        const t = map.terrain[i];
        ctx.fillStyle = t === 1 ? '#6b5d44' : t === 2 ? '#d8742a' : '#b89550';
        ctx.fillRect(x + tx * sx, y + ty * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    for (const b of world.buildings) {
      if (world.config.fog && b.owner !== this.localFaction && !world.fog.explored(b.tx, b.ty)) continue;
      ctx.fillStyle = b.owner === this.localFaction ? '#46d46e' : '#e0524a';
      ctx.fillRect(x + b.tx * sx, y + b.ty * sy, Math.max(2, b.def.w * sx), Math.max(2, b.def.h * sy));
    }
    for (const u of world.units) {
      if (world.config.fog && u.owner !== this.localFaction && !world.fog.visible(u.tileX, u.tileY)) continue;
      ctx.fillStyle = u.owner === this.localFaction ? '#9bffb5' : '#ff8a82';
      ctx.fillRect(x + u.tileX * sx, y + u.tileY * sy, 2, 2);
    }
    // camera viewport
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + (cam.x / TILE) * sx, y + (cam.y / TILE) * sy,
      (cam.viewW / TILE) * sx, (cam.viewH / TILE) * sy);

    // "Under attack" ping — a pulsing red ring at the last hit on a player entity (~2.5s).
    const sinceAlert = world.time - world.alertTime;
    if (sinceAlert >= 0 && sinceAlert < 2.5) {
      const ax = x + (world.alertX / TILE) * sx;
      const ay = y + (world.alertY / TILE) * sy;
      const pulse = 1 - ((sinceAlert % 0.6) / 0.6); // re-pulses every 0.6s
      ctx.strokeStyle = `rgba(255,80,70,${0.85 * pulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ax, ay, 2 + pulse * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawOverlay(world: World, overlay: Overlay, difficulty: Difficulty, hasSave: boolean,
                      skirmishSel: SkirmishSel | null): void {
    const ctx = this.ctx;
    const w = this.screenW - SIDEBAR_W;
    // The title + skirmish setup are full-screen menus (no game yet); in-play overlays dim only the play area.
    const full = overlay === 'title' || overlay === 'skirmish';
    const dimW = full ? this.screenW : w;
    ctx.fillStyle = full ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, dimW, this.screenH);
    const cx = dimW / 2;
    let cy = this.screenH / 2 - 60;

    ctx.textAlign = 'center';
    if (overlay === 'title') {
      this.drawTitle(cx, hasSave);
    } else if (overlay === 'skirmish') {
      this.drawSkirmish(cx, skirmishSel ?? { house: 'atreides', difficulty, ai: 'balanced' });
    } else if (overlay === 'paused') {
      this.drawPause(cx);
    } else if (overlay === 'brief') {
      cy = this.screenH / 2 - 110; // flow the whole brief downward from here
      ctx.fillStyle = '#ffd479';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(world.config.name, cx, cy);
      cy += 28;

      // House picker (faction asymmetry) — pick your House; the enemy is the opposite.
      ctx.fillStyle = '#8a929c';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('YOUR HOUSE', cx, cy);
      cy += 8;
      const hbw = 116, hbh = 24, hgap = 10;
      let hbx = cx - (hbw * 2 + hgap) / 2;
      for (const h of HOUSE_ORDER) {
        const rect = { x: hbx, y: cy, w: hbw, h: hbh };
        this.houseRects.push({ h, rect });
        this.button(rect, HOUSES[h].name, h === world.player.house, false);
        hbx += hbw + hgap;
      }
      ctx.textAlign = 'center';
      cy += hbh + 14;
      ctx.fillStyle = '#8fa0ad';
      ctx.font = '11px monospace';
      ctx.fillText(`${HOUSES[world.player.house].blurb}   (enemy: House ${HOUSES[world.enemy.house].name})`, cx, cy);
      cy += 26;

      // Difficulty picker.
      ctx.fillStyle = '#8a929c';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('DIFFICULTY', cx, cy);
      cy += 8;
      const bw = 90, bh = 24, gap = 10;
      let bx = cx - (bw * 3 + gap * 2) / 2;
      for (const d of DIFFICULTY_ORDER) {
        const rect = { x: bx, y: cy, w: bw, h: bh };
        this.diffRects.push({ d, rect });
        this.button(rect, DIFFICULTY[d].label, d === difficulty, false);
        bx += bw + gap;
      }
      ctx.textAlign = 'center';
      cy += bh + 26;

      // Mission brief (variable height), then the begin prompt below it.
      ctx.fillStyle = '#dfe6ec';
      ctx.font = '13px monospace';
      const lines = this.wrap(world.config.brief, cx, cy, w * 0.72, 18);
      cy += lines * 18 + 22;
      ctx.fillStyle = '#9bffb5';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('▶ Click to begin', cx, cy);
    } else {
      const won = overlay === 'won';
      ctx.fillStyle = won ? '#9bffb5' : '#ff8a82';
      ctx.font = 'bold 34px monospace';
      ctx.fillText(won ? 'VICTORY' : 'DEFEAT', cx, cy);
      cy += 44;
      ctx.fillStyle = '#dfe6ec';
      ctx.font = '15px monospace';
      const kind = world.config.objective?.kind ?? 'destroyAll';
      const msg = won
        ? (kind === 'survive' ? 'You held the line!'
          : kind === 'defend' ? 'Position secured.'
          : kind === 'destroyTarget' ? 'Target eliminated.'
          : 'Enemy base destroyed.')
        : (kind === 'defend' ? 'The position fell.'
          : kind === 'survive' ? 'Overrun before the clock ran out.'
          : 'Your base was overrun.');
      ctx.fillText(msg, cx, cy);
      ctx.fillStyle = '#ffd479';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(won ? '▶ Click to continue' : '▶ Click to retry', cx, this.screenH / 2 + 70);
    }
    ctx.textAlign = 'left';
  }

  /** Main-menu / title screen. Entry point for the campaign and (later) skirmish; Continue is
   *  dimmed when no quick-save exists. Button rects go to this.titleRects for hitTestTitle. */
  private drawTitle(cx: number, hasSave: boolean): void {
    const ctx = this.ctx;
    let cy = this.screenH / 2 - 120;
    ctx.fillStyle = '#ffd479';
    ctx.font = 'bold 46px monospace';
    ctx.fillText('DUNE', cx, cy);
    cy += 44;
    ctx.fillStyle = '#cbb06a';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('CLONE', cx, cy);
    cy += 30;
    ctx.fillStyle = '#8fa0ad';
    ctx.font = '12px monospace';
    ctx.fillText('A real-time strategy skirmish for the spice', cx, cy);
    cy += 36;

    const items: { id: string; label: string; dim: boolean }[] = [
      { id: 'campaign', label: 'CAMPAIGN', dim: false },
      { id: 'skirmish', label: 'SKIRMISH', dim: false },
      { id: 'multiplayer', label: 'MULTIPLAYER', dim: false },
      { id: 'continue', label: hasSave ? 'CONTINUE' : 'CONTINUE  (no save)', dim: !hasSave },
    ];
    this.menu(items, cx, cy, this.titleRects);
  }

  /** In-play pause screen. Sim is frozen while shown (Game.step early-returns on any overlay).
   *  Button rects go to this.pauseRects for hitTestPause. */
  private drawPause(cx: number): void {
    const ctx = this.ctx;
    let cy = this.screenH / 2 - 96;
    ctx.fillStyle = '#dfe6ec';
    ctx.font = 'bold 34px monospace';
    ctx.fillText('PAUSED', cx, cy);
    cy += 40;

    const items = [
      { id: 'resume', label: 'RESUME', dim: false },
      { id: 'restart', label: 'RESTART MISSION', dim: false },
      { id: 'menu', label: 'QUIT TO MENU', dim: false },
    ];
    cy = this.menu(items, cx, cy, this.pauseRects);

    cy += 6;
    ctx.textAlign = 'center'; // menuButton() leaves textAlign='left'
    ctx.fillStyle = '#7f8a96';
    ctx.font = '11px monospace';
    ctx.fillText('P or Esc to resume', cx, cy);
  }

  /** Stack labelled menu buttons centered on cx; records rects into `out`; returns the next y. */
  private menu(items: { id: string; label: string; dim: boolean }[], cx: number, startY: number,
    out: { id: string; rect: Rect }[]): number {
    const bw = 260, bh = 36, gap = 12;
    let y = startY;
    for (const it of items) {
      const rect = { x: cx - bw / 2, y, w: bw, h: bh };
      out.push({ id: it.id, rect });
      this.menuButton(rect, it.label, it.dim);
      y += bh + gap;
    }
    return y;
  }

  private menuButton(r: Rect, label: string, dim: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = dim ? '#1b1e24' : '#23272e';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = dim ? '#2a2e36' : '#6a7480';
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillStyle = dim ? '#5a6470' : '#e8edf2';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 5);
    ctx.textAlign = 'left';
  }

  /** Skirmish setup: House + Difficulty + Enemy-AI pickers + Begin/Back. Reuses the brief's
   *  picker primitives (button() + the same rect arrays) plus a new AI-personality row. */
  private drawSkirmish(cx: number, sel: SkirmishSel): void {
    const ctx = this.ctx;
    let cy = this.screenH / 2 - 150;
    ctx.fillStyle = '#ffd479';
    ctx.font = 'bold 30px monospace';
    ctx.fillText('SKIRMISH', cx, cy);
    cy += 22;
    ctx.fillStyle = '#8fa0ad';
    ctx.font = '12px monospace';
    ctx.fillText('A custom battle on a freshly generated map', cx, cy);
    cy += 30;

    // House picker (enemy takes the opposite house).
    ctx.fillStyle = '#8a929c'; ctx.font = 'bold 11px monospace';
    ctx.fillText('YOUR HOUSE', cx, cy); cy += 8;
    const hbw = 116, hbh = 24, hgap = 10;
    let hbx = cx - (hbw * 2 + hgap) / 2;
    for (const h of HOUSE_ORDER) {
      const rect = { x: hbx, y: cy, w: hbw, h: hbh };
      this.houseRects.push({ h, rect });
      this.button(rect, HOUSES[h].name, h === sel.house, false);
      hbx += hbw + hgap;
    }
    ctx.textAlign = 'center';
    cy += hbh + 12;
    ctx.fillStyle = '#8fa0ad'; ctx.font = '11px monospace';
    ctx.fillText(`${HOUSES[sel.house].blurb}   (enemy: House ${HOUSES[otherHouse(sel.house)].name})`, cx, cy);
    cy += 24;

    // Difficulty picker.
    ctx.fillStyle = '#8a929c'; ctx.font = 'bold 11px monospace';
    ctx.fillText('DIFFICULTY', cx, cy); cy += 8;
    const bw = 90, bh = 24, gap = 10;
    let bx = cx - (bw * 3 + gap * 2) / 2;
    for (const d of DIFFICULTY_ORDER) {
      const rect = { x: bx, y: cy, w: bw, h: bh };
      this.diffRects.push({ d, rect });
      this.button(rect, DIFFICULTY[d].label, d === sel.difficulty, false);
      bx += bw + gap;
    }
    ctx.textAlign = 'center';
    cy += bh + 24;

    // Enemy AI personality picker.
    ctx.fillStyle = '#8a929c'; ctx.font = 'bold 11px monospace';
    ctx.fillText('ENEMY AI', cx, cy); cy += 8;
    const aw = 96, ah = 24, agap = 8;
    const n = PERSONALITY_ORDER.length;
    let ax = cx - (aw * n + agap * (n - 1)) / 2;
    for (const id of PERSONALITY_ORDER) {
      const rect = { x: ax, y: cy, w: aw, h: ah };
      this.aiRects.push({ id, rect });
      this.button(rect, PERSONALITIES[id].name, id === sel.ai, false);
      ax += aw + agap;
    }
    ctx.textAlign = 'center';
    cy += ah + 12;
    ctx.fillStyle = '#8fa0ad'; ctx.font = '11px monospace';
    ctx.fillText(PERSONALITIES[sel.ai]?.blurb ?? '', cx, cy);
    cy += 30;

    // Begin / Back.
    const actions: { action: 'begin' | 'back'; label: string }[] = [
      { action: 'begin', label: '▶ BEGIN SKIRMISH' },
      { action: 'back', label: 'BACK' },
    ];
    const mbw = 260, mbh = 34, mgap = 10;
    for (const it of actions) {
      const rect = { x: cx - mbw / 2, y: cy, w: mbw, h: mbh };
      this.skActionRects.push({ action: it.action, rect });
      this.menuButton(rect, it.label, false);
      cy += mbh + mgap;
    }
  }

  /** Draw word-wrapped text; returns the number of lines drawn (so callers can flow layout). */
  private wrap(text: string, cx: number, y: number, maxW: number, lh: number): number {
    const ctx = this.ctx;
    const words = text.split(' ');
    let line = '';
    let yy = y;
    let lines = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = word;
        yy += lh;
        lines++;
      } else {
        line = test;
      }
    }
    if (line) { ctx.fillText(line, cx, yy); lines++; }
    return lines;
  }

  private drawCommandBar(sel: Unit[]): void {
    const ctx = this.ctx;
    const armed = sel.filter((u) => u.def.weapon);
    const rows = armed.length > 0 ? 2 : 1;
    const bw = 74, bh = 22, pad = 6, gap = 4;
    const panelW = bw * 4 + gap * 3 + pad * 2;
    const panelH = 18 + rows * (bh + gap) + pad;
    const x0 = 8;
    const y0 = this.screenH - panelH - 8;

    ctx.fillStyle = 'rgba(12,14,18,0.9)';
    ctx.fillRect(x0, y0, panelW, panelH);
    ctx.strokeStyle = '#2a2e36';
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, panelW - 1, panelH - 1);

    ctx.fillStyle = '#cdd6df';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(this.selSummary(sel), x0 + pad, y0 + 13);

    let y = y0 + 18;
    COMMANDS.forEach((c, i) => {
      const rect = { x: x0 + pad + i * (bw + gap), y, w: bw, h: bh };
      this.cmdRects.push({ cmd: c.cmd, rect });
      const dim = c.cmd !== 'stop' && armed.length === 0;
      this.button(rect, c.label, false, dim);
    });

    if (armed.length > 0) {
      y += bh + gap;
      const cur = this.dominantStance(armed);
      STANCES.forEach((s, i) => {
        const rect = { x: x0 + pad + i * (bw + gap), y, w: bw, h: bh };
        this.stanceRects.push({ stance: s, rect });
        this.button(rect, STANCE_LABEL[s], cur === s, false);
      });
    }
  }

  private button(r: Rect, label: string, active: boolean, dim: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = active ? '#3a5b3f' : '#23272e';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = active ? '#7fe39a' : dim ? '#2a2e36' : '#4a525c';
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillStyle = dim ? '#5a6470' : active ? '#d8ffe2' : '#dfe6ec';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, r.x + r.w / 2, r.y + 15);
    ctx.textAlign = 'left';
  }

  private selSummary(sel: Unit[]): string {
    const counts = new Map<string, number>();
    for (const u of sel) counts.set(u.def.name, (counts.get(u.def.name) ?? 0) + 1);
    const parts = [...counts.entries()].map(([n, c]) => `${c} ${n}`);
    return parts.join(', ').slice(0, 40);
  }

  private dominantStance(armed: Unit[]): Stance | null {
    const first = armed[0].stance;
    return armed.every((u) => u.stance === first) ? first : null;
  }

  hitTestCommandBar(x: number, y: number): UiAction | null {
    for (const c of this.cmdRects) if (inRect(x, y, c.rect)) return { type: 'command', cmd: c.cmd };
    for (const s of this.stanceRects) if (inRect(x, y, s.rect)) return { type: 'stance', stance: s.stance };
    return null;
  }

  /** Hit-test the top resource bar (currently just the mute toggle). */
  hitTestTopBar(x: number, y: number): UiAction | null {
    if (inRect(x, y, this.muteRect)) return { type: 'mute' };
    return null;
  }

  /** Hit-test the brief overlay's pickers. Returns a house/difficulty pick, or null (→ begin). */
  hitTestOverlay(x: number, y: number): OverlayPick | null {
    for (const h of this.houseRects) if (inRect(x, y, h.rect)) return { house: h.h };
    for (const d of this.diffRects) if (inRect(x, y, d.rect)) return { difficulty: d.d };
    return null;
  }

  /** Hit-test the title-screen menu buttons; returns the button id ('campaign'|'continue') or null. */
  hitTestTitle(x: number, y: number): string | null {
    for (const b of this.titleRects) if (inRect(x, y, b.rect)) return b.id;
    return null;
  }

  /** Hit-test the pause-screen menu buttons; returns the button id ('resume'|'restart'|'menu') or null. */
  hitTestPause(x: number, y: number): string | null {
    for (const b of this.pauseRects) if (inRect(x, y, b.rect)) return b.id;
    return null;
  }

  /** Hit-test the skirmish-setup screen (House/Difficulty/AI pickers + Begin/Back), or null. */
  hitTestSkirmish(x: number, y: number): SkirmishPick | null {
    for (const a of this.aiRects) if (inRect(x, y, a.rect)) return { ai: a.id };
    for (const h of this.houseRects) if (inRect(x, y, h.rect)) return { house: h.h };
    for (const d of this.diffRects) if (inRect(x, y, d.rect)) return { difficulty: d.d };
    for (const s of this.skActionRects) if (inRect(x, y, s.rect)) return { action: s.action };
    return null;
  }

  hitTest(x: number, y: number, cam: Camera): UiAction | null {
    if (inRect(x, y, this.minimap)) {
      const tx = (x - this.minimap.x) / this.minimap.w * MAP_W;
      const ty = (y - this.minimap.y) / this.minimap.h * MAP_H;
      return { type: 'minimap', wx: tx * TILE, wy: ty * TILE };
    }
    for (const s of this.structRects) if (inRect(x, y, s.rect)) return { type: 'structure', id: s.id };
    for (const u of this.unitRects) if (inRect(x, y, u.rect)) return { type: 'unit', id: u.id };
    for (const up of this.upgradeRects) if (inRect(x, y, up.rect)) return { type: 'upgrade', id: up.id };
    void cam;
    return null;
  }

  isInSidebar(x: number): boolean { return x >= this.sidebarX; }
}

interface IconState {
  label: string; cost: number; color: string;
  enabled: boolean; ready: boolean; progress: number; queue: number;
  owned?: boolean;  // purchased upgrade (renders an OWNED badge + gold border)
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
