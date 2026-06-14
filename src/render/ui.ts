// Command sidebar (minimap + build menus), top resource bar, and mission overlays. The UI
// computes clickable rects while drawing and exposes hitTest() so the controller can route
// clicks back to world actions.

import type { World } from '../world/world';
import type { Camera } from '../core/camera';
import type { Unit } from '../world/unit';
import { BUILDINGS, UNITS, UPGRADES, BUILD_MENU_ORDER, UPGRADE_ORDER, STANCE_LABEL, DIFFICULTY, DIFFICULTY_ORDER } from '../world/defs';
import type { Stance, Difficulty } from '../world/defs';
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
  | { type: 'difficulty'; difficulty: Difficulty };

export type Overlay = 'none' | 'brief' | 'won' | 'lost';

export class Ui {
  private structRects: { id: string; rect: Rect }[] = [];
  private unitRects: { id: string; rect: Rect }[] = [];
  private upgradeRects: { id: string; rect: Rect }[] = [];
  private cmdRects: { cmd: CommandKind; rect: Rect }[] = [];
  private stanceRects: { stance: Stance; rect: Rect }[] = [];
  private diffRects: { d: Difficulty; rect: Rect }[] = [];
  private minimap: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private screenW = 0;
  private screenH = 0;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  get sidebarX(): number { return this.screenW - SIDEBAR_W; }

  draw(world: World, cam: Camera, screenW: number, screenH: number, overlay: Overlay,
       selUnits: Unit[], difficulty: Difficulty): void {
    this.screenW = screenW;
    this.screenH = screenH;
    this.drawTopBar(world);
    this.drawSidebar(world, cam);
    this.cmdRects = [];
    this.stanceRects = [];
    this.diffRects = [];
    if (overlay === 'none' && selUnits.length > 0) this.drawCommandBar(selUnits);
    if (overlay !== 'none') this.drawOverlay(world, overlay, difficulty);
  }

  private drawTopBar(world: World): void {
    const ctx = this.ctx;
    const w = this.screenW - SIDEBAR_W;
    ctx.fillStyle = 'rgba(10,12,16,0.85)';
    ctx.fillRect(0, 0, w, 26);
    const power = world.powerInfo('player');
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#ffd479';
    ctx.fillText(`⬡ ${Math.floor(world.player.credits)}`, 12, 18);
    ctx.fillStyle = power.factor < 1 ? '#e0524a' : '#7fd0ff';
    ctx.fillText(`⚡ ${power.produced}/${power.consumed}`, 140, 18);
    if (power.factor < 1) {
      ctx.fillStyle = '#e0524a';
      ctx.fillText('LOW POWER', 280, 18);
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
    const unitIds = UNIT_ICON_ORDER.filter((id) => world.ownedTypes('player').has(UNITS[id].builtAt));
    y = this.iconGrid(unitIds, y, (id) => this.unitState(world, id), this.unitRects);

    // Upgrades — appear once the player owns the tech building (Radar Outpost).
    this.upgradeRects = [];
    if (world.ownedTypes('player').has('radar')) {
      y += 6;
      y = this.section('UPGRADES', y);
      this.iconGrid(UPGRADE_ORDER, y, (id) => this.upgradeState(world, id), this.upgradeRects);
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
    const p = world.player;
    const building = p.building?.defId === id ? p.building.progress : 0;
    const ready = p.ready === id;
    return {
      label: def.name, cost: def.cost, color: def.color,
      enabled: ready || world.canStartBuilding('player', id),
      ready, progress: building, queue: 0,
    };
  }

  private unitState(world: World, id: string): IconState {
    const def = UNITS[id];
    const q = world.player.unitQueues.get(def.builtAt) ?? [];
    const mine = q.filter((it) => it.defId === id);
    const head = q[0]?.defId === id ? q[0].progress : 0;
    return {
      label: def.name, cost: def.cost, color: def.color,
      enabled: world.canQueueUnit('player', id),
      ready: false, progress: head, queue: mine.length,
    };
  }

  private upgradeState(world: World, id: string): IconState {
    const def = UPGRADES[id];
    const owned = world.player.upgrades.has(id);
    return {
      label: def.short, cost: def.cost, color: '#39476a',
      enabled: world.canPurchaseUpgrade('player', id),
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
      if (world.config.fog && b.owner === 'enemy' && !world.fog.explored(b.tx, b.ty)) continue;
      ctx.fillStyle = b.owner === 'player' ? '#46d46e' : '#e0524a';
      ctx.fillRect(x + b.tx * sx, y + b.ty * sy, Math.max(2, b.def.w * sx), Math.max(2, b.def.h * sy));
    }
    for (const u of world.units) {
      if (world.config.fog && u.owner === 'enemy' && !world.fog.visible(u.tileX, u.tileY)) continue;
      ctx.fillStyle = u.owner === 'player' ? '#9bffb5' : '#ff8a82';
      ctx.fillRect(x + u.tileX * sx, y + u.tileY * sy, 2, 2);
    }
    // camera viewport
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + (cam.x / TILE) * sx, y + (cam.y / TILE) * sy,
      (cam.viewW / TILE) * sx, (cam.viewH / TILE) * sy);
  }

  private drawOverlay(world: World, overlay: Overlay, difficulty: Difficulty): void {
    const ctx = this.ctx;
    const w = this.screenW - SIDEBAR_W;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, w, this.screenH);
    const cx = w / 2;
    let cy = this.screenH / 2 - 60;

    ctx.textAlign = 'center';
    if (overlay === 'brief') {
      ctx.fillStyle = '#ffd479';
      ctx.font = 'bold 26px monospace';
      ctx.fillText(world.config.name, cx, cy);
      cy += 40;
      ctx.fillStyle = '#dfe6ec';
      ctx.font = '14px monospace';
      this.wrap(world.config.brief, cx, cy, w * 0.7, 20);

      // Difficulty picker — three buttons centred between the brief and "Click to begin".
      ctx.fillStyle = '#8a929c';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('DIFFICULTY', cx, this.screenH / 2 + 18);
      const bw = 90, bh = 26, gap = 10;
      const totalW = bw * 3 + gap * 2;
      let bx = cx - totalW / 2;
      const by = this.screenH / 2 + 28;
      for (const d of DIFFICULTY_ORDER) {
        const rect = { x: bx, y: by, w: bw, h: bh };
        this.diffRects.push({ d, rect });
        this.button(rect, DIFFICULTY[d].label, d === difficulty, false);
        bx += bw + gap;
      }
      ctx.textAlign = 'center';

      ctx.fillStyle = '#9bffb5';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('▶ Click to begin', cx, this.screenH / 2 + 92);
    } else {
      const won = overlay === 'won';
      ctx.fillStyle = won ? '#9bffb5' : '#ff8a82';
      ctx.font = 'bold 34px monospace';
      ctx.fillText(won ? 'VICTORY' : 'DEFEAT', cx, cy);
      cy += 44;
      ctx.fillStyle = '#dfe6ec';
      ctx.font = '15px monospace';
      ctx.fillText(won ? 'Enemy base destroyed.' : 'Your base was overrun.', cx, cy);
      ctx.fillStyle = '#ffd479';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(won ? '▶ Click to continue' : '▶ Click to retry', cx, this.screenH / 2 + 70);
    }
    ctx.textAlign = 'left';
  }

  private wrap(text: string, cx: number, y: number, maxW: number, lh: number): void {
    const ctx = this.ctx;
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = word;
        yy += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, yy);
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

  /** Hit-test the difficulty picker on the brief overlay. Returns the picked level or null. */
  hitTestOverlay(x: number, y: number): Difficulty | null {
    for (const d of this.diffRects) if (inRect(x, y, d.rect)) return d.d;
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
