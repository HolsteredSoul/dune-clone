// Controller: owns the World + AI for the current mission and translates input into commands,
// selection, building placement, and mission flow. step() advances the fixed simulation;
// frame() processes discrete input once per rendered frame and draws.

import type { Camera } from '../core/camera';
import type { Input, KeyPress } from '../core/input';
import type { Renderer, ViewState } from '../render/renderer';
import type { Ui, Overlay, SkirmishSel } from '../render/ui';
import { World } from '../world/world';
import type { WorldSnapshot, MissionConfig } from '../world/world';
import { EnemyAI } from '../world/ai';
import { Building } from '../world/building';
import { BUILDINGS } from '../world/defs';
import type { BuildingDef, Difficulty, House, Faction } from '../world/defs';
import { TILE, SIDEBAR_W, SIM_HZ } from '../world/constants';
import { MISSIONS, makeSkirmishConfig } from './missions';
import { audio } from '../core/audio';
import { Lobby } from '../net/lobby';
import type { MatchSetup } from '../net/lobby';
import { NetSession } from '../net/session';
import { applyCommand, hashWorld } from '../net/commands';
import type { Command } from '../net/protocol';
import type { Transport } from '../net/transport';

const SAVE_KEY = 'dune_save';
const SAVE_VERSION = 1;
const NET_INPUT_DELAY = 5; // lockstep input delay in sim ticks (~83ms at 60Hz) — the jitter buffer

/** A multiplayer match config: the symmetric skirmish start with each side's chosen House. */
function makeMpConfig(playerHouse: House, enemyHouse: House): MissionConfig {
  return { ...makeSkirmishConfig('balanced'), playerHouse, enemyHouse };
}

interface SaveData {
  version: number;
  missionIndex: number;
  difficulty: Difficulty;
  // Present only for a skirmish save: the runtime config has no MISSIONS index to rebuild from,
  // so we persist it (plain JSON) and discriminate on its presence. Backward-compatible: old
  // campaign saves lack it and take the campaign path, so no SAVE_VERSION bump is needed.
  skirmish?: MissionConfig;
  cam: { x: number; y: number };
  selected: number[];
  groups: [number, number[]][];
  world: WorldSnapshot;
  ai: { think: number; waveSize: number; holdUntil: number; attacking: boolean };
}

export class Game {
  world!: World;
  private ai!: EnemyAI;
  overlay: Overlay = 'brief';
  // Whether a compatible quick-save exists; computed on title-entry so the Continue button
  // doesn't re-parse the save blob every frame while idling on the menu.
  private titleHasSave = false;
  // Session-persistent across missions; deliberately NOT reset in load().
  private difficulty: Difficulty = 'normal';
  private playerHouse: House = 'atreides'; // chosen on the brief; enemy is the opposite house
  // Skirmish mode: a non-campaign match built from a runtime config (no missionIndex).
  private inSkirmish = false;             // true while a skirmish MATCH is active (vs campaign)
  private skirmishConfig: MissionConfig | null = null; // the live skirmish config (for save + rematch)
  private skirmishAi = 'balanced';        // session-persistent enemy AI personality pick
  private lobby: Lobby | null = null;     // lazy DOM multiplayer lobby (additive; outside the sim)
  // Multiplayer: which faction THIS client controls/views, and the active lockstep session.
  // Single-player keeps localFaction='player' and net=null, so every path below is unchanged.
  private localFaction: Faction = 'player';
  private net: NetSession | null = null;

  private readonly selected = new Set<number>();
  private selectedBuilding: Building | null = null;
  private placing: BuildingDef | null = null;
  private pendingAttackMove = false;
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;
  // Control groups: digit selects, Ctrl/Shift+digit assigns, double-tap a digit centers the camera.
  private readonly groups = new Map<number, number[]>();
  private lastGroupTap: { n: number; t: number } = { n: -1, t: 0 };
  // Transient on-screen confirmation (save/load feedback).
  private toastMsg = '';
  private toastTtl = 0;

  constructor(
    private readonly cam: Camera,
    private readonly input: Input,
    private readonly renderer: Renderer,
    private readonly ui: Ui,
    private missionIndex = 0,
  ) {
    this.load(missionIndex);
    this.enterTitle(); // boot to the main menu; load() leaves mission 0 ready behind it
  }

  /** Switch to the title screen and refresh the cached has-save flag (gates Continue). */
  private enterTitle(): void {
    this.overlay = 'title';
    this.inSkirmish = false; // no active match while on the menu
    this.titleHasSave = this.hasSave();
  }

  /** Construct the World + AI for a config and reset all per-match controller state. Shared by
   *  the campaign (load) and skirmish (startSkirmish) launch paths so they can't drift. */
  private begin(cfg: MissionConfig, personality?: string): void {
    this.world = new World(cfg, this.difficulty, this.playerHouse);
    this.ai = new EnemyAI(this.world, cfg.aggression, personality ?? cfg.aiPersonality);
    this.cam.centerOn(
      (cfg.cameraStart.tx + 0.5) * TILE,
      (cfg.cameraStart.ty + 0.5) * TILE,
    );
    this.selected.clear();
    this.selectedBuilding = null;
    this.placing = null;
    this.pendingAttackMove = false;
    this.dragging = false;
    this.dragStart = null;
    this.groups.clear();
    this.lastGroupTap = { n: -1, t: 0 };
  }

  private load(i: number): void {
    this.missionIndex = i;
    this.inSkirmish = false;
    this.skirmishConfig = null;
    this.begin(MISSIONS[i]);
    this.overlay = 'brief';
  }

  /** Build + launch a one-off skirmish from the current pickers (House/Difficulty/AI). */
  private startSkirmish(): void {
    const cfg = makeSkirmishConfig(this.skirmishAi);
    this.skirmishConfig = cfg;
    this.inSkirmish = true;
    this.missionIndex = -1; // no campaign index
    this.begin(cfg, this.skirmishAi);
    this.overlay = 'none'; // the setup screen was the brief — drop straight into play
  }

  step(dt: number): void {
    if (this.toastTtl > 0) this.toastTtl -= dt;
    if (this.overlay !== 'none') return;
    this.cam.update(dt, this.input); // camera is always local (cosmetic), even while net-stalled
    if (this.net) {
      this.net.step(); // lockstep gate: advances 0 or 1 sim ticks via advanceTick() when ready
    } else {
      this.world.update(dt);
      this.ai.update(dt);
      this.checkResult();
    }
  }

  /** Advance the shared sim exactly one fixed tick. Driven by the lockstep session in MP (no AI in
   *  a PvP match — both human sides issue their own commands). */
  private advanceTick(): void {
    this.world.update(1 / SIM_HZ);
    this.checkResult();
  }

  /** Resolve the won/lost edge into the overlay. `world.result` is player-centric and identical on
   *  both clients (deterministic); a MP guest (faction 'enemy') sees the flipped outcome. */
  private checkResult(): void {
    if (this.world.result === 'playing') return;
    let outcome: 'won' | 'lost' = this.world.result;
    if (this.localFaction === 'enemy') outcome = outcome === 'won' ? 'lost' : 'won';
    this.overlay = outcome; // single edge — step() early-returns thereafter
    audio.play(outcome === 'won' ? 'victory' : 'defeat');
  }

  frame(): void {
    this.handleInput();
    this.playWorldAudio();
    this.render();
    this.input.flush();
  }

  /** Drain the sim's per-tick sound cues. Spatial cues (fire/explosion) are gated to on-screen
   *  shots and panned by their screen-x; alerts/UI confirmations always play centred. */
  private playWorldAudio(): void {
    const events = this.world.audioEvents;
    for (const e of events) {
      if (e.name.startsWith('fire') || e.name.startsWith('explosion')) {
        if (!this.onScreen(e.x, e.y)) continue;
        audio.play(e.name, this.panFor(e.x));
      } else {
        audio.play(e.name);
      }
    }
    events.length = 0;
  }

  private onScreen(wx: number, wy: number): boolean {
    const m = 64; // small margin so edge action still sounds
    return wx >= this.cam.x - m && wx <= this.cam.x + this.cam.viewW + m
        && wy >= this.cam.y - m && wy <= this.cam.y + this.cam.viewH + m;
  }

  private panFor(wx: number): number {
    const half = this.cam.viewW / 2;
    if (half <= 0) return 0;
    return Math.max(-1, Math.min(1, (wx - this.cam.x - half) / half)) * 0.6;
  }

  // ---- input -------------------------------------------------------------------------------

  private handleInput(): void {
    // Resume the AudioContext from within a real user gesture (browser autoplay policy).
    if (this.input.pointerEvents.length || this.input.keyPresses.length) audio.unlock();
    // At most one overlay click per frame: a single click can change the overlay (e.g.
    // title → brief), and a queued second click must not fall through to the next screen.
    let overlayClickDone = false;
    for (const e of this.input.pointerEvents) {
      if (this.overlay !== 'none') {
        if (e.kind === 'leftdown' && !overlayClickDone) { this.onOverlayClick(e.x, e.y); overlayClickDone = true; }
        continue;
      }
      if (e.kind === 'leftdown') this.onLeftDown(e.x, e.y);
      else if (e.kind === 'leftup') this.onLeftUp(e.x, e.y);
      else if (e.kind === 'rightdown') this.onRightDown(e.x, e.y);
    }
    for (const key of this.input.keyPresses) this.onKey(key);
  }

  /** Control groups: Ctrl/Shift+digit assigns the current selection to a group; a plain digit
   *  selects that group; double-tapping the digit (within 350ms) also re-centres the camera on it.
   *  (Shift+digit is the reliable assign — Ctrl+digit is a browser tab-switch in most browsers.) */
  private handleGroupKey(k: KeyPress): void {
    const n = Number(k.code.slice(5));
    if (!(n >= 1 && n <= 9)) return;
    if (k.ctrl || k.shift) {
      const ids = [...this.selected];
      if (ids.length) { this.groups.set(n, ids); audio.play('select'); }
      else this.groups.delete(n);
      return;
    }
    const ids = this.groups.get(n);
    const living = ids ? ids.filter((id) => { const u = this.world.findUnit(id); return !!u && u.alive; }) : [];
    if (living.length === 0) { if (ids) this.groups.delete(n); return; }
    this.selected.clear();
    this.selectedBuilding = null;
    for (const id of living) this.selected.add(id);
    audio.play('select');
    const now = performance.now();
    if (this.lastGroupTap.n === n && now - this.lastGroupTap.t < 350) this.centerOnGroup(living);
    this.lastGroupTap = { n, t: now };
  }

  private centerOnGroup(ids: number[]): void {
    let sx = 0, sy = 0, c = 0;
    for (const id of ids) {
      const u = this.world.findUnit(id);
      if (u && u.alive) { sx += u.x; sy += u.y; c++; }
    }
    if (c) this.cam.centerOn(sx / c, sy / c);
  }

  private toast(msg: string): void { this.toastMsg = msg; this.toastTtl = 2.5; }

  /** Quick-save the full game (sim + AI + camera/selection) to localStorage. Play only. */
  private quickSave(): void {
    if (this.net) { this.toast('Save is unavailable in multiplayer'); return; }
    if (this.overlay !== 'none') { this.toast('Can only save during play'); return; }
    const data: SaveData = {
      version: SAVE_VERSION,
      missionIndex: this.missionIndex,
      difficulty: this.difficulty,
      skirmish: this.inSkirmish && this.skirmishConfig ? this.skirmishConfig : undefined,
      cam: { x: this.cam.x, y: this.cam.y },
      selected: [...this.selected],
      groups: [...this.groups.entries()],
      world: this.world.serialize(),
      ai: this.ai.serialize(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.toast('Game saved');
    } catch { this.toast('Save failed'); }
  }

  /** Restore the game saved by quickSave(), rebuilding the world for the right mission first. */
  private quickLoad(): void {
    if (this.net) { this.toast('Load is unavailable in multiplayer'); return; }
    let raw: string | null = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch { /* private mode */ }
    if (!raw) { this.toast('No saved game'); return; }
    let data: SaveData;
    try { data = JSON.parse(raw) as SaveData; } catch { this.toast('Save corrupt'); return; }
    if (!data || data.version !== SAVE_VERSION) { this.toast('Save incompatible'); return; }
    // A campaign save must carry a valid MISSIONS index (skirmish saves rebuild from data.skirmish).
    if (!data.skirmish && (data.missionIndex < 0 || data.missionIndex >= MISSIONS.length)) {
      this.toast('Save incompatible'); return;
    }

    this.difficulty = data.difficulty;
    this.playerHouse = data.world.player.house ?? this.playerHouse; // keep the saved house as the pref
    if (data.skirmish) {
      // Skirmish save: rebuild from the persisted runtime config (no MISSIONS index).
      this.inSkirmish = true;
      this.skirmishConfig = data.skirmish;
      this.skirmishAi = data.skirmish.aiPersonality ?? 'balanced';
      this.missionIndex = -1;
      this.world = new World(data.skirmish, this.difficulty, this.playerHouse);
      this.world.deserialize(data.world);
      this.ai = new EnemyAI(this.world, data.skirmish.aggression, this.skirmishAi);
    } else {
      this.inSkirmish = false;
      this.skirmishConfig = null;
      this.missionIndex = data.missionIndex;
      this.world = new World(MISSIONS[this.missionIndex], this.difficulty, this.playerHouse);
      this.world.deserialize(data.world);
      this.ai = new EnemyAI(this.world, MISSIONS[this.missionIndex].aggression,
        MISSIONS[this.missionIndex].aiPersonality);
    }
    this.ai.restore(data.ai);

    this.cam.x = data.cam.x; this.cam.y = data.cam.y;
    this.selected.clear();
    for (const id of data.selected) this.selected.add(id);
    this.groups.clear();
    for (const [n, ids] of data.groups) this.groups.set(n, ids);
    this.selectedBuilding = null;
    this.placing = null;
    this.pendingAttackMove = false;
    this.dragging = false;
    this.dragStart = null;
    this.overlay = 'none';
    this.toast('Game loaded');
  }

  /** Rebuild the current mission so a newly-picked difficulty or house takes effect (both are
   *  applied at World/EnemyAI construction). Stays on the brief overlay. */
  private reloadBrief(): void {
    this.load(this.missionIndex);
  }

  /** Route a left-click while an overlay is showing. Title/pause have discrete buttons; brief
   *  routes its pickers (null → begin); won/lost advance on any click. */
  private onOverlayClick(x: number, y: number): void {
    if (this.overlay === 'title') {
      const id = this.ui.hitTestTitle(x, y);
      if (id === 'campaign') this.startCampaign();
      else if (id === 'skirmish') this.overlay = 'skirmish';
      else if (id === 'multiplayer') this.openMultiplayer();
      else if (id === 'continue' && this.titleHasSave) this.quickLoad(); // dim = truly disabled
      return;
    }
    if (this.overlay === 'skirmish') {
      const pick = this.ui.hitTestSkirmish(x, y);
      if (!pick) return; // clicked dead space — ignore
      if ('house' in pick) this.playerHouse = pick.house;
      else if ('difficulty' in pick) this.difficulty = pick.difficulty;
      else if ('ai' in pick) this.skirmishAi = pick.ai;
      else if (pick.action === 'begin') this.startSkirmish();
      else if (pick.action === 'back') this.enterTitle();
      return;
    }
    if (this.overlay === 'paused') {
      const id = this.ui.hitTestPause(x, y);
      if (id === 'resume') this.overlay = 'none';
      // Restart replays immediately. A skirmish has no MISSIONS index (missionIndex = -1), so it
      // must rebuild from the live skirmish config via begin(), not load(); both drop into play.
      else if (id === 'restart') {
        if (this.inSkirmish && this.skirmishConfig) this.begin(this.skirmishConfig, this.skirmishAi);
        else this.load(this.missionIndex);
        this.overlay = 'none';
      } else if (id === 'menu') this.enterTitle();
      return;
    }
    if (this.overlay === 'brief') {
      const pick = this.ui.hitTestOverlay(x, y);
      if (pick && 'difficulty' in pick) { this.difficulty = pick.difficulty; this.reloadBrief(); }
      else if (pick && 'house' in pick) { this.playerHouse = pick.house; this.reloadBrief(); }
      else this.advanceOverlay();
      return;
    }
    this.advanceOverlay(); // won / lost
  }

  /** Start the campaign from mission 1 (load() shows its brief; difficulty/house persist). */
  private startCampaign(): void {
    this.load(0);
  }

  /** Open the multiplayer lobby (a DOM overlay over the canvas; the title stays underneath). */
  private openMultiplayer(): void {
    if (!this.lobby) this.lobby = new Lobby();
    this.lobby.open(
      (setup) => this.onMatchStart(setup),
      () => { /* lobby cancelled/left — it hid itself; the title is still showing */ },
    );
  }

  /** Launch a networked match from the synchronized lobby. The HOST builds the canonical world and
   *  ships its snapshot; the GUEST rebuilds the same world then adopts that snapshot, so both start
   *  byte-identical and run the deterministic lockstep from there. */
  private onMatchStart(setup: MatchSetup): void {
    if (setup.isHost) {
      this.difficulty = setup.options.difficulty;
      this.playerHouse = setup.houses.player;
      this.begin(makeMpConfig(setup.houses.player, setup.houses.enemy));
      setup.transport.send({
        t: 'start', snapshot: this.world.serialize(), startTick: 0, inputDelay: NET_INPUT_DELAY,
        difficulty: this.difficulty, playerHouse: setup.houses.player, enemyHouse: setup.houses.enemy,
      });
      this.startNet(setup.transport, 'player');
    } else {
      const s = setup.start!;
      this.difficulty = s.difficulty;
      this.playerHouse = s.playerHouse; // the world's 'player' faction (the host) — same on both clients
      this.begin(makeMpConfig(s.playerHouse, s.enemyHouse));
      this.world.deserialize(s.snapshot); // adopt the host's canonical t=0 state
      this.startNet(setup.transport, 'enemy');
    }
    this.lobby?.handOff(); // hide the lobby DOM but keep the socket (the session now owns it)
    this.overlay = 'none';
  }

  /** Attach a lockstep session over the lobby's transport and take control of `faction`. */
  private startNet(transport: Transport, faction: Faction): void {
    this.missionIndex = -1;
    this.inSkirmish = false;
    this.localFaction = faction;
    this.world.localFaction = faction;
    this.world.recomputeFog(); // show MY fog at once (a guest just deserialized the host's fog)
    this.net = new NetSession(transport, faction, {
      apply: (env) => applyCommand(this.world, env),
      advance: () => this.advanceTick(),
      hash: () => hashWorld(this.world),
    }, NET_INPUT_DELAY);
    this.net.onDesync = (tick) => this.toast(`Desync at tick ${tick} — match halted`);
    this.net.onPeerGone = () => { this.toast('Opponent disconnected'); this.endNetToTitle(); };
    this.centerOnMyBase();
  }

  /** Center the camera on the local faction's starting base. */
  private centerOnMyBase(): void {
    const home = this.world.buildings.find((b) => b.owner === this.localFaction);
    if (home) this.cam.centerOn(home.centerX, home.centerY);
  }

  /** Tear down a net match (detach session, close socket) and return to the title. */
  private endNetToTitle(): void {
    this.net?.destroy();
    this.net = null;
    this.lobby?.close(); // match over → close the transport
    this.localFaction = 'player';
    this.enterTitle();
  }

  /** Toggle the in-play pause overlay (sim freezes while any overlay is up). Disabled in a net
   *  match — a local freeze would just stall the lockstep for both players (no shared pause in v1). */
  private togglePause(): void {
    if (this.net) return;
    if (this.overlay === 'paused') this.overlay = 'none';
    else if (this.overlay === 'none') { this.overlay = 'paused'; audio.play('select'); }
  }

  /** Whether a compatible quick-save exists (gates the title's Continue button). */
  private hasSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw) as SaveData;
      return !!d && d.version === SAVE_VERSION;
    } catch { return false; }
  }

  private advanceOverlay(): void {
    if (this.overlay === 'brief') { this.overlay = 'none'; return; }
    // A net match has no campaign progression and no MISSIONS index — win or lose returns to the
    // title (and tears down the session/socket). Must be handled before the missionIndex paths.
    if (this.net) { this.endNetToTitle(); return; }
    // A skirmish has no campaign progression — win or lose returns to the menu (settings persist
    // so the player can re-open Skirmish and re-run with one click).
    if (this.inSkirmish) { this.enterTitle(); return; }
    if (this.overlay === 'won') {
      const next = this.missionIndex + 1;
      this.load(next < MISSIONS.length ? next : 0);
    } else if (this.overlay === 'lost') {
      this.load(this.missionIndex);
    }
  }

  /** Issue a player command. Single-player applies it immediately; multiplayer routes it through
   *  the lockstep session (scheduled + broadcast, applied identically on every client). Either way
   *  it is tagged with this client's localFaction — never a hardcoded 'player'. */
  private emit(cmd: Command): void {
    if (this.net) this.net.queue(cmd);
    else applyCommand(this.world, { issuingFaction: this.localFaction, cmd });
  }

  private onLeftDown(x: number, y: number): void {
    if (this.ui.isInSidebar(x)) {
      const action = this.ui.hitTest(x, y, this.cam);
      if (action) this.doUiAction(action);
      return;
    }
    const top = this.ui.hitTestTopBar(x, y);
    if (top) { this.doUiAction(top); return; }
    if (this.placing) {
      this.tryPlace(x, y);
      return;
    }
    if (this.pendingAttackMove) {
      const units = this.selectedUnits();
      if (units.length) {
        this.emit({ kind: 'attackMove', unitIds: units.map((u) => u.id), wx: this.cam.x + x, wy: this.cam.y + y });
        audio.play('move');
      }
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
    if (this.ui.isInSidebar(x)) {
      const action = this.ui.hitTest(x, y, this.cam);
      if (action) this.doUiCancel(action);
      return;
    }
    const units = this.selectedUnits();
    if (units.length > 0) {
      this.emit({ kind: 'smart', unitIds: units.map((u) => u.id), wx: this.cam.x + x, wy: this.cam.y + y });
      audio.play('move');
      return;
    }
    // No units selected: if a friendly producer building is selected, set its rally.
    const b = this.selectedBuilding;
    if (b && b.owner === this.localFaction && b.isProducer) {
      const wx = this.cam.x + x, wy = this.cam.y + y;
      const onSelf = b.coversTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
      if (onSelf) this.emit({ kind: 'clearRally', buildingId: b.id });
      else this.emit({ kind: 'setRally', buildingId: b.id, wx, wy });
    }
  }

  private onKey(k: KeyPress): void {
    const code = k.code;
    // Mute works on every screen (the top-bar speaker is unreachable while an overlay eats clicks).
    if (code === 'KeyM') { const muted = audio.toggleMute(); if (!muted) audio.play('select'); return; }
    // Pause: P toggles in-play/paused; Esc resumes when paused (and cancels-then-pauses in play, below).
    if (code === 'KeyP' && (this.overlay === 'none' || this.overlay === 'paused')) { this.togglePause(); return; }
    if (this.overlay === 'paused') { if (code === 'Escape') this.overlay = 'none'; return; }
    if (this.overlay !== 'none') return; // title/brief/won/lost: no gameplay hotkeys

    if (code.startsWith('Digit')) { this.handleGroupKey(k); return; }
    if (k.ctrl && code === 'KeyS') { this.quickSave(); return; }
    if (k.ctrl && code === 'KeyL') { this.quickLoad(); return; }
    const units = this.selectedUnits();
    switch (code) {
      case 'Escape':
        // Cancel any pending action first; if there's nothing to cancel, open the pause menu.
        if (this.placing || this.pendingAttackMove || this.selected.size > 0 || this.selectedBuilding) {
          this.placing = null;
          this.pendingAttackMove = false;
          this.selected.clear();
          this.selectedBuilding = null;
        } else {
          this.togglePause();
        }
        break;
      case 'Space': this.centerOnMyBase(); break;
      case 'KeyA': if (units.length) { this.pendingAttackMove = true; audio.play('select'); } break;
      case 'KeyS': if (units.length) { this.emit({ kind: 'stop', unitIds: units.map((u) => u.id) }); audio.play('move'); } break;
      case 'KeyH': if (units.length) { this.emit({ kind: 'hold', unitIds: units.map((u) => u.id) }); audio.play('move'); } break;
      case 'KeyG': if (units.length) { this.emit({ kind: 'guard', unitIds: units.map((u) => u.id) }); audio.play('move'); } break;
      case 'KeyR': {
        const b = this.selectedBuilding;
        if (b && b.owner === this.localFaction) {
          this.emit({ kind: 'toggleRepair', buildingId: b.id });
          audio.play('select');
          this.toast(b.repairing ? 'Repairing' : 'Repair off'); // SP: reads post-toggle; MP: optimistic
        }
        break;
      }
    }
  }

  private doUiAction(action: ReturnType<Ui['hitTest']>): void {
    if (!action) return;
    if (action.type === 'mute') {
      const muted = audio.toggleMute();
      if (!muted) audio.play('select');
    } else if (action.type === 'minimap') {
      this.cam.centerOn(action.wx, action.wy);
    } else if (action.type === 'unit') {
      const ok = this.world.canQueueUnit(this.localFaction, action.id);
      this.emit({ kind: 'queueUnit', defId: action.id });
      if (ok) audio.play('build-start');
    } else if (action.type === 'upgrade') {
      const ok = this.world.canPurchaseUpgrade(this.localFaction, action.id);
      this.emit({ kind: 'purchaseUpgrade', id: action.id });
      if (ok) audio.play('upgrade');
    } else if (action.type === 'structure') {
      if (this.world.player_(this.localFaction).ready === action.id) {
        this.placing = BUILDINGS[action.id];
        audio.play('select'); // picked a finished structure up to place
      } else if (this.world.canStartBuilding(this.localFaction, action.id)) {
        this.emit({ kind: 'startBuilding', defId: action.id });
        audio.play('build-start');
      }
    } else if (action.type === 'command') {
      const ids = this.selectedUnits().map((u) => u.id);
      if (action.cmd === 'attackmove') this.pendingAttackMove = ids.length > 0;
      else if (action.cmd === 'stop' && ids.length) this.emit({ kind: 'stop', unitIds: ids });
      else if (action.cmd === 'hold' && ids.length) this.emit({ kind: 'hold', unitIds: ids });
      else if (action.cmd === 'guard' && ids.length) this.emit({ kind: 'guard', unitIds: ids });
      if (ids.length) audio.play('move');
    } else if (action.type === 'stance') {
      const ids = this.selectedUnits().map((u) => u.id);
      if (ids.length) { this.emit({ kind: 'stance', unitIds: ids, stance: action.stance }); audio.play('select'); }
    }
  }

  /** Right-click in the sidebar cancels one queued item with a full refund. Upgrades are
   *  permanent and non-refundable, so they're ignored. */
  private doUiCancel(action: ReturnType<Ui['hitTest']>): void {
    if (!action) return;
    if (action.type === 'unit') { this.emit({ kind: 'cancelUnit', defId: action.id }); audio.play('cancel'); }
    else if (action.type === 'structure') {
      this.emit({ kind: 'cancelStructure', defId: action.id });
      audio.play('cancel');
    }
  }

  private tryPlace(x: number, y: number): void {
    const def = this.placing!;
    const { tx, ty } = this.ghostTile(def, x, y);
    if (this.world.canPlace(this.localFaction, def, tx, ty)) {
      this.emit({ kind: 'placeReady', tx, ty });
      this.placing = null;
      audio.play('place');
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
    const u = this.world.unitAt(wx, wy, this.localFaction);
    if (u) {
      this.selected.add(u.id);
      this.selectedBuilding = null;
      audio.play('select');
      return;
    }
    const b = this.world.buildingAtTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
    this.selectedBuilding = b && b.owner === this.localFaction ? b : null;
    if (this.selectedBuilding) audio.play('select');
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number): void {
    this.selected.clear();
    this.selectedBuilding = null;
    const units = this.world.unitsInRect(
      this.cam.x + x0, this.cam.y + y0, this.cam.x + x1, this.cam.y + y1, this.localFaction);
    for (const u of units) this.selected.add(u.id);
    if (this.selected.size > 0) audio.play('select');
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
        valid: this.world.canPlace(this.localFaction, this.placing, tx, ty),
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
    this.renderer.draw(this.world, this.cam, view, this.localFaction);
    const hasSave = this.overlay === 'title' && this.titleHasSave; // cached on title-entry, no per-frame I/O
    const skirmishSel: SkirmishSel | null = this.overlay === 'skirmish'
      ? { house: this.playerHouse, difficulty: this.difficulty, ai: this.skirmishAi }
      : null;
    this.ui.draw(this.world, this.cam, this.cam.viewW + SIDEBAR_W, this.cam.viewH,
      this.overlay, selUnits, this.difficulty, audio.muted,
      this.toastTtl > 0 ? this.toastMsg : null, hasSave, skirmishSel, this.localFaction);
  }
}
