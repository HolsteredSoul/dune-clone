// Controller: owns the World + AI for the current mission and translates input into commands,
// selection, building placement, and mission flow. step() advances the fixed simulation;
// frame() processes discrete input once per rendered frame and draws.

import type { Camera } from '../core/camera';
import type { Input } from '../core/input';
import type { Renderer, ViewState } from '../render/renderer';
import type { Ui, Overlay } from '../render/ui';
import { World } from '../world/world';
import { EnemyAI } from '../world/ai';
import { Building } from '../world/building';
import { BUILDINGS } from '../world/defs';
import type { BuildingDef, Difficulty } from '../world/defs';
import { TILE, SIDEBAR_W } from '../world/constants';
import { MISSIONS } from './missions';

export class Game {
  world!: World;
  private ai!: EnemyAI;
  overlay: Overlay = 'brief';
  // Session-persistent across missions; deliberately NOT reset in load().
  private difficulty: Difficulty = 'normal';

  private readonly selected = new Set<number>();
  private selectedBuilding: Building | null = null;
  private placing: BuildingDef | null = null;
  private pendingAttackMove = false;
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;

  constructor(
    private readonly cam: Camera,
    private readonly input: Input,
    private readonly renderer: Renderer,
    private readonly ui: Ui,
    private missionIndex = 0,
  ) {
    this.load(missionIndex);
  }

  private load(i: number): void {
    this.missionIndex = i;
    this.world = new World(MISSIONS[i], this.difficulty);
    this.ai = new EnemyAI(this.world, MISSIONS[i].aggression);
    this.cam.centerOn(
      (MISSIONS[i].cameraStart.tx + 0.5) * TILE,
      (MISSIONS[i].cameraStart.ty + 0.5) * TILE,
    );
    this.selected.clear();
    this.selectedBuilding = null;
    this.placing = null;
    this.pendingAttackMove = false;
    this.dragging = false;
    this.dragStart = null;
    this.overlay = 'brief';
  }

  step(dt: number): void {
    if (this.overlay !== 'none') return;
    this.cam.update(dt, this.input);
    this.world.update(dt);
    this.ai.update(dt);
    if (this.world.result !== 'playing') this.overlay = this.world.result;
  }

  frame(): void {
    this.handleInput();
    this.render();
    this.input.flush();
  }

  // ---- input -------------------------------------------------------------------------------

  private handleInput(): void {
    for (const e of this.input.pointerEvents) {
      if (this.overlay !== 'none') {
        if (e.kind === 'leftdown') {
          const d = this.overlay === 'brief' ? this.ui.hitTestOverlay(e.x, e.y) : null;
          if (d) { this.difficulty = d; this.reloadForDifficulty(); }
          else this.advanceOverlay();
        }
        continue;
      }
      if (e.kind === 'leftdown') this.onLeftDown(e.x, e.y);
      else if (e.kind === 'leftup') this.onLeftUp(e.x, e.y);
      else if (e.kind === 'rightdown') this.onRightDown(e.x, e.y);
    }
    for (const key of this.input.keyPresses) this.onKey(key);
  }

  /** Rebuild the current mission so the newly-picked difficulty's handicaps take effect
   *  (they're applied at World/EnemyAI construction). Stays on the brief overlay. */
  private reloadForDifficulty(): void {
    this.load(this.missionIndex);
  }

  private advanceOverlay(): void {
    if (this.overlay === 'brief') { this.overlay = 'none'; return; }
    if (this.overlay === 'won') {
      const next = this.missionIndex + 1;
      this.load(next < MISSIONS.length ? next : 0);
    } else if (this.overlay === 'lost') {
      this.load(this.missionIndex);
    }
  }

  private onLeftDown(x: number, y: number): void {
    if (this.ui.isInSidebar(x)) {
      const action = this.ui.hitTest(x, y, this.cam);
      if (action) this.doUiAction(action);
      return;
    }
    if (this.placing) {
      this.tryPlace(x, y);
      return;
    }
    if (this.pendingAttackMove) {
      const units = this.selectedUnits();
      if (units.length) this.world.commandAttackMove(units, this.cam.x + x, this.cam.y + y);
      this.pendingAttackMove = false;
      return;
    }
    const bar = this.ui.hitTestCommandBar(x, y);
    if (bar) { this.doUiAction(bar); return; }
    this.dragStart = { x, y };
    this.dragging = true;
  }

  private onLeftUp(x: number, y: number): void {
    if (!this.dragging || !this.dragStart) return;
    this.dragging = false;
    const start = this.dragStart;
    this.dragStart = null;
    const dist = Math.hypot(x - start.x, y - start.y);
    if (dist < 6) {
      this.clickSelect(x, y);
    } else {
      this.boxSelect(start.x, start.y, x, y);
    }
  }

  private onRightDown(x: number, y: number): void {
    if (this.placing) { this.placing = null; return; }
    if (this.pendingAttackMove) { this.pendingAttackMove = false; return; }
    if (this.ui.isInSidebar(x)) return;
    const units = this.selectedUnits();
    if (units.length > 0) {
      this.world.commandSmart(units, this.cam.x + x, this.cam.y + y);
      return;
    }
    // No units selected: if a friendly producer building is selected, set its rally.
    const b = this.selectedBuilding;
    if (b && b.owner === 'player' && b.isProducer) {
      const wx = this.cam.x + x, wy = this.cam.y + y;
      const onSelf = b.coversTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
      if (onSelf) this.world.clearRally(b);
      else this.world.setRally(b, wx, wy);
    }
  }

  private onKey(code: string): void {
    const units = this.selectedUnits();
    switch (code) {
      case 'Escape':
        this.placing = null;
        this.pendingAttackMove = false;
        this.selected.clear();
        this.selectedBuilding = null;
        break;
      case 'Space': {
        const home = this.world.buildings.find((b) => b.owner === 'player');
        if (home) this.cam.centerOn(home.centerX, home.centerY);
        break;
      }
      case 'KeyA': if (units.length) this.pendingAttackMove = true; break;
      case 'KeyS': this.world.commandStop(units); break;
      case 'KeyH': this.world.commandHold(units); break;
      case 'KeyG': this.world.commandGuard(units); break;
    }
  }

  private doUiAction(action: ReturnType<Ui['hitTest']>): void {
    if (!action) return;
    if (action.type === 'minimap') {
      this.cam.centerOn(action.wx, action.wy);
    } else if (action.type === 'unit') {
      this.world.queueUnit('player', action.id);
    } else if (action.type === 'structure') {
      if (this.world.player.ready === action.id) {
        this.placing = BUILDINGS[action.id];
      } else if (this.world.canStartBuilding('player', action.id)) {
        this.world.startBuilding('player', action.id);
      }
    } else if (action.type === 'command') {
      const units = this.selectedUnits();
      if (action.cmd === 'attackmove') this.pendingAttackMove = units.length > 0;
      else if (action.cmd === 'stop') this.world.commandStop(units);
      else if (action.cmd === 'hold') this.world.commandHold(units);
      else if (action.cmd === 'guard') this.world.commandGuard(units);
    } else if (action.type === 'stance') {
      this.world.setStance(this.selectedUnits(), action.stance);
    }
  }

  private tryPlace(x: number, y: number): void {
    const def = this.placing!;
    const { tx, ty } = this.ghostTile(def, x, y);
    if (this.world.canPlace('player', def, tx, ty)) {
      this.world.placeReady('player', tx, ty);
      this.placing = null;
    }
  }

  private ghostTile(def: BuildingDef, x: number, y: number): { tx: number; ty: number } {
    const wx = this.cam.x + x, wy = this.cam.y + y;
    return {
      tx: Math.floor(wx / TILE) - (def.w >> 1),
      ty: Math.floor(wy / TILE) - (def.h >> 1),
    };
  }

  private clickSelect(x: number, y: number): void {
    const wx = this.cam.x + x, wy = this.cam.y + y;
    this.selected.clear();
    const u = this.world.unitAt(wx, wy, 'player');
    if (u) {
      this.selected.add(u.id);
      this.selectedBuilding = null;
      return;
    }
    const b = this.world.buildingAtTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
    this.selectedBuilding = b && b.owner === 'player' ? b : null;
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number): void {
    this.selected.clear();
    this.selectedBuilding = null;
    const units = this.world.unitsInRect(
      this.cam.x + x0, this.cam.y + y0, this.cam.x + x1, this.cam.y + y1, 'player');
    for (const u of units) this.selected.add(u.id);
  }

  private selectedUnits() {
    const out = [];
    for (const id of this.selected) {
      const u = this.world.findUnit(id);
      if (u && u.alive) out.push(u);
    }
    return out;
  }

  // ---- render ------------------------------------------------------------------------------

  private render(): void {
    const mouse = this.input;
    let placing: ViewState['placing'] = null;
    if (this.placing && !this.ui.isInSidebar(mouse.mouseX)) {
      const { tx, ty } = this.ghostTile(this.placing, mouse.mouseX, mouse.mouseY);
      placing = {
        def: this.placing, tx, ty,
        valid: this.world.canPlace('player', this.placing, tx, ty),
      };
    }
    const selUnits = this.selectedUnits();
    const view: ViewState = {
      selected: this.selected,
      selectedBuilding: this.selectedBuilding,
      placing,
      aimAttackMove: this.pendingAttackMove,
      dragRect: this.dragging && this.dragStart
        ? { x0: this.dragStart.x, y0: this.dragStart.y, x1: mouse.mouseX, y1: mouse.mouseY }
        : null,
    };
    this.renderer.draw(this.world, this.cam, view);
    this.ui.draw(this.world, this.cam, this.cam.viewW + SIDEBAR_W, this.cam.viewH,
      this.overlay, selUnits, this.difficulty);
  }
}
