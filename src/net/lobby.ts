// Multiplayer lobby — a self-contained DOM overlay (NOT canvas), mounted over the game canvas.
//
// Why DOM: the lobby needs text inputs (name / relay URL / room code) which are painful on canvas.
// It builds its own elements with inline styles and appends to <body>, so index.html and the canvas
// render pipeline are untouched. It owns the Transport and the lobby state machine, and hands a
// finished MatchSetup back to the controller when the host starts.
//
// Host authority: the FIRST peer in a room is the host (relay assigns ids in join order). The host
// holds the authoritative slot list + options and broadcasts `lobbyState`; guests send their
// name/house/ready to the host and render whatever it broadcasts. v1 caps at 2 players
// (host = 'player', guest = 'enemy') to match the existing two-owner world.

import type { Faction } from '../world/defs';
import type { House, Difficulty } from '../world/defs';
import type { WorldSnapshot } from '../world/world';
import type { NetMessage, PlayerSlot, LobbyOptions } from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import type { Transport } from './transport';
import { RelayTransport, relayUrl } from './transport';

/** Everything the controller needs to launch a synchronized match. */
export interface MatchSetup {
  transport: Transport;
  isHost: boolean;
  localFaction: Faction;       // 'player' (host) or 'enemy' (guest)
  localPeerId: string;
  hostPeerId: string;
  slots: PlayerSlot[];
  options: LobbyOptions;
  houses: { player: House; enemy: House }; // each side's chosen House (host=player, guest=enemy)
  // Guest only: the host's authoritative start payload (build the same world, then adopt this).
  start?: { snapshot: WorldSnapshot; difficulty: Difficulty; playerHouse: House; enemyHouse: House; inputDelay: number };
}

const DEFAULT_RELAY = 'ws://localhost:8787';
const MAX_PLAYERS = 2; // v1: two-owner world (player vs enemy)

const GOLD = '#ffd479';
const PANEL_BG = '#15110a';

export class Lobby {
  private root: HTMLDivElement | null = null;
  private transport: Transport | null = null;
  private onStart: (m: MatchSetup) => void = () => {};
  private onCancel: () => void = () => {};

  // Identity / role.
  private isHost = false;
  private name = 'Commander';
  private hostId = '';
  private myHouse: House = 'atreides';

  // Authoritative (host) or last-received (guest) lobby state.
  private slots: PlayerSlot[] = [];
  private options: LobbyOptions = { mission: 'skirmish', difficulty: 'normal' };

  // DOM handles rebuilt per view.
  private connectView!: HTMLDivElement;
  private lobbyView!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private slotsEl!: HTMLDivElement;
  private controlsEl!: HTMLDivElement;

  /** Show the lobby (connect screen). Callbacks fire on a successful start / on cancel-back. */
  open(onStart: (m: MatchSetup) => void, onCancel: () => void): void {
    this.onStart = onStart;
    this.onCancel = onCancel;
    if (!this.root) this.build();
    this.resetToConnect();
    this.root!.style.display = 'flex';
  }

  /** Tear down: close the socket, hide the overlay. */
  close(): void {
    this.transport?.close();
    this.transport = null;
    if (this.root) this.root.style.display = 'none';
  }

  /** Hand the live socket to the match: hide the DOM but DON'T close the connection (the session
   *  now owns it). Releasing our reference means a later close() can't tear the match's socket down. */
  handOff(): void {
    this.transport = null;
    if (this.root) this.root.style.display = 'none';
  }

  // ---- DOM construction -------------------------------------------------------------------

  private build(): void {
    const root = el('div', `
      position:fixed; inset:0; z-index:1000; display:none;
      align-items:center; justify-content:center;
      background:rgba(8,6,3,0.82); font-family:monospace; color:#e8edf2;`);

    const panel = el('div', `
      width:460px; max-width:92vw; background:${PANEL_BG};
      border:1px solid #6a5a30; border-radius:6px; padding:22px 26px;
      box-shadow:0 10px 40px rgba(0,0,0,0.6);`);

    const title = el('div', `color:${GOLD}; font-weight:bold; font-size:22px; letter-spacing:2px; margin-bottom:2px;`, 'MULTIPLAYER');
    const sub = el('div', 'color:#8fa0ad; font-size:11px; margin-bottom:16px;', 'Skirmish over the network — host runs  npm run relay');

    this.connectView = el('div', '');
    this.lobbyView = el('div', 'display:none;');
    this.statusEl = el('div', 'min-height:16px; margin-top:12px; font-size:12px; color:#cbb06a;');

    panel.append(title, sub, this.connectView, this.lobbyView, this.statusEl);
    root.append(panel);
    document.body.appendChild(root);
    this.root = root;

    this.buildConnectView();
    this.buildLobbyShell();
  }

  private buildConnectView(): void {
    const v = this.connectView;
    const nameIn = textField('Your name', this.name);
    const urlIn = textField('Relay URL', DEFAULT_RELAY);
    const roomIn = textField('Room code', 'dune');
    v.append(nameIn.row, urlIn.row, roomIn.row);

    const btnRow = el('div', 'display:flex; gap:10px; margin-top:16px;');
    const connectBtn = button('CONNECT', true);
    const backBtn = button('BACK', false);
    btnRow.append(connectBtn, backBtn);
    v.append(btnRow);

    connectBtn.onclick = (): void => {
      this.name = nameIn.input.value.trim() || 'Commander';
      const url = urlIn.input.value.trim() || DEFAULT_RELAY;
      const room = roomIn.input.value.trim() || 'dune';
      void this.connect(url, room);
    };
    backBtn.onclick = (): void => { this.close(); this.onCancel(); };
  }

  private buildLobbyShell(): void {
    const v = this.lobbyView;
    this.slotsEl = el('div', 'margin:4px 0 14px;');
    this.controlsEl = el('div', '');
    v.append(this.slotsEl, this.controlsEl);
  }

  private resetToConnect(): void {
    this.slots = [];
    this.isHost = false;
    this.hostId = '';
    this.connectView.style.display = '';
    this.lobbyView.style.display = 'none';
    this.setStatus('');
  }

  // ---- connection / handshake -------------------------------------------------------------

  private async connect(url: string, room: string): Promise<void> {
    this.setStatus('Connecting…');
    const t = new RelayTransport(relayUrl(url, room, this.name));
    this.transport = t;
    t.onMessage = (from, data): void => this.onMessage(from, data);
    t.onPeerJoin = (): void => { /* host rebroadcasts on hello, not raw join */ };
    t.onPeerLeave = (peerId): void => this.onPeerLeave(peerId);
    t.onClose = (clean): void => this.onConnectionClosed(clean);
    try {
      await t.connect();
    } catch {
      this.setStatus('Could not reach the relay. Is  npm run relay  running at that URL?');
      this.transport = null;
      return;
    }
    this.isHost = t.peers.length === 0;
    this.hostId = this.isHost ? (t.peerId as string) : t.peers[0];

    if (this.isHost) {
      // Seed the authoritative slot list with myself.
      this.slots = [this.makeSlot(t.peerId as string, this.name, 'player', this.myHouse, true, true)];
      this.broadcastLobby();
    } else {
      // Tell the host who I am; it will assign me a faction and broadcast the lobby.
      this.send({ t: 'hello', name: this.name, protocolVersion: PROTOCOL_VERSION }, this.hostId);
    }
    this.enterLobbyView();
  }

  private enterLobbyView(): void {
    this.connectView.style.display = 'none';
    this.lobbyView.style.display = '';
    this.setStatus(this.isHost ? 'You are the HOST.' : 'Connected. Waiting for the host…');
    this.renderLobby();
  }

  // ---- message handling -------------------------------------------------------------------

  private onMessage(from: string, msg: NetMessage): void {
    if (this.isHost) this.hostHandle(from, msg);
    else this.guestHandle(msg);
  }

  /** HOST: owns the slot list. Reacts to guest hello/ready/setHouse and rebroadcasts. */
  private hostHandle(from: string, msg: NetMessage): void {
    switch (msg.t) {
      case 'hello': {
        if (msg.protocolVersion !== PROTOCOL_VERSION) { this.send({ t: 'desync', tick: -1 }, from); return; }
        if (this.slots.some((s) => s.peerId === from)) return; // already seated
        if (this.slots.length >= MAX_PLAYERS) { this.send({ t: 'desync', tick: -2 }, from); return; } // full
        this.slots.push(this.makeSlot(from, msg.name, 'enemy', 'harkonnen', false, false));
        this.broadcastLobby();
        break;
      }
      case 'ready': {
        const s = this.slots.find((x) => x.peerId === from);
        if (s) { s.ready = msg.ready; this.broadcastLobby(); }
        break;
      }
      case 'setHouse': {
        const s = this.slots.find((x) => x.peerId === from);
        if (s) { s.house = msg.house; this.broadcastLobby(); }
        break;
      }
      default: break; // host ignores other inbound types in the lobby
    }
  }

  /** GUEST: render whatever the host broadcasts; react to a start handoff (Phase 3). */
  private guestHandle(msg: NetMessage): void {
    switch (msg.t) {
      case 'lobbyState':
        this.slots = msg.slots;
        this.options = msg.options;
        this.setStatus('In lobby.');
        this.renderLobby();
        break;
      case 'desync':
        // Reused as a lightweight reject in the lobby: -1 = version mismatch, -2 = full.
        this.setStatus(msg.tick === -2 ? 'Lobby is full.' : 'Version mismatch with host.');
        break;
      case 'start':
        // The host launched: hand the snapshot + match params to the controller, which rebuilds
        // the identical world and runs lockstep as the 'enemy' faction.
        this.onStart({
          transport: this.transport as Transport,
          isHost: false,
          localFaction: 'enemy',
          localPeerId: this.transport!.peerId as string,
          hostPeerId: this.hostId,
          slots: this.slots,
          options: this.options,
          houses: { player: msg.playerHouse, enemy: msg.enemyHouse },
          start: {
            snapshot: msg.snapshot, difficulty: msg.difficulty,
            playerHouse: msg.playerHouse, enemyHouse: msg.enemyHouse, inputDelay: msg.inputDelay,
          },
        });
        break;
      default: break;
    }
  }

  private onPeerLeave(peerId: string): void {
    if (this.isHost) {
      const before = this.slots.length;
      this.slots = this.slots.filter((s) => s.peerId !== peerId);
      if (this.slots.length !== before) this.broadcastLobby();
    } else if (peerId === this.hostId) {
      this.setStatus('Host left the lobby.');
      this.resetToConnect();
    }
  }

  private onConnectionClosed(clean: boolean): void {
    if (!clean) this.setStatus('Connection to the relay was lost.');
    this.resetToConnect();
  }

  // ---- host actions -----------------------------------------------------------------------

  private broadcastLobby(): void {
    const payload: NetMessage = { t: 'lobbyState', slots: this.slots, options: this.options };
    this.send(payload); // to all others
    this.renderLobby(); // and reflect locally
  }

  private start(): void {
    if (!this.isHost) return;
    if (this.slots.length < MAX_PLAYERS || !this.slots.every((s) => s.ready)) return;
    const hostSlot = this.slots.find((s) => s.faction === 'player');
    const guestSlot = this.slots.find((s) => s.faction === 'enemy');
    if (!hostSlot || !guestSlot) return;
    // Hand the synchronized setup to the controller: it builds the canonical world, broadcasts the
    // 'start' snapshot to the guest (which lands in that client's lobby below), and runs lockstep.
    this.onStart({
      transport: this.transport as Transport,
      isHost: true,
      localFaction: 'player',
      localPeerId: this.transport!.peerId as string,
      hostPeerId: this.hostId,
      slots: this.slots,
      options: this.options,
      houses: { player: hostSlot.house, enemy: guestSlot.house },
    });
  }

  // ---- shared helpers ---------------------------------------------------------------------

  private send(msg: NetMessage, to?: string): void {
    this.transport?.send(msg, to);
  }

  private makeSlot(peerId: string, name: string, faction: Faction, house: House,
    ready: boolean, isHost: boolean): PlayerSlot {
    return { peerId, name, faction, house, ready, isHost };
  }

  private mySlot(): PlayerSlot | undefined {
    return this.slots.find((s) => s.peerId === this.transport?.peerId);
  }

  private setStatus(msg: string): void {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  // ---- lobby rendering --------------------------------------------------------------------

  private renderLobby(): void {
    this.renderSlots();
    this.renderControls();
  }

  private renderSlots(): void {
    const box = this.slotsEl;
    box.innerHTML = '';
    box.append(el('div', `color:${GOLD}; font-size:12px; margin-bottom:6px;`,
      `Players (${this.slots.length}/${MAX_PLAYERS})  ·  room map: Skirmish (symmetric)`));
    for (const s of this.slots) {
      const me = s.peerId === this.transport?.peerId;
      const row = el('div', `display:flex; justify-content:space-between; padding:6px 8px; margin:3px 0;
        border:1px solid #3a3422; border-radius:4px; background:${me ? '#1d1810' : '#120e07'};`);
      const left = el('div', 'font-size:13px;',
        `${s.faction === 'player' ? '◆' : '◇'} ${s.name}${me ? '  (you)' : ''}${s.isHost ? '  [host]' : ''}`);
      const right = el('div', `font-size:12px; color:${s.ready ? '#7fd18a' : '#c9a04a'};`,
        `${cap(s.house)} · ${s.ready ? 'READY' : 'not ready'}`);
      row.append(left, right);
      box.append(row);
    }
  }

  private renderControls(): void {
    const box = this.controlsEl;
    box.innerHTML = '';

    // House picker (always — each player owns their house).
    box.append(this.housePicker());

    // Difficulty picker — host only (it's a match-wide option).
    if (this.isHost) box.append(this.difficultyPicker());
    else box.append(el('div', 'font-size:11px; color:#8fa0ad; margin-top:8px;',
      `Difficulty: ${cap(this.options.difficulty)} (set by host)`));

    const actions = el('div', 'display:flex; gap:10px; margin-top:16px;');
    if (this.isHost) {
      const canStart = this.slots.length >= MAX_PLAYERS && this.slots.every((s) => s.ready);
      const startBtn = button(canStart ? 'START' : 'START  (waiting…)', canStart);
      startBtn.onclick = (): void => this.start();
      actions.append(startBtn);
    } else {
      const ready = this.mySlot()?.ready ?? false;
      const readyBtn = button(ready ? 'UNREADY' : 'READY', true);
      readyBtn.onclick = (): void => this.send({ t: 'ready', ready: !ready }, this.hostId);
      actions.append(readyBtn);
    }
    const leaveBtn = button('LEAVE', false);
    leaveBtn.onclick = (): void => { this.close(); this.onCancel(); };
    actions.append(leaveBtn);
    box.append(actions);
  }

  private housePicker(): HTMLDivElement {
    const wrap = el('div', 'margin-top:6px;');
    wrap.append(el('div', 'font-size:11px; color:#8fa0ad; margin-bottom:4px;', 'Your House'));
    const row = el('div', 'display:flex; gap:8px;');
    for (const h of ['atreides', 'harkonnen'] as House[]) {
      const active = this.myHouse === h;
      const b = button(cap(h), active);
      b.style.flex = '1';
      b.onclick = (): void => { this.myHouse = h; this.applyMyHouse(); };
      row.append(b);
    }
    wrap.append(row);
    return wrap;
  }

  private difficultyPicker(): HTMLDivElement {
    const wrap = el('div', 'margin-top:10px;');
    wrap.append(el('div', 'font-size:11px; color:#8fa0ad; margin-bottom:4px;', 'Difficulty (host)'));
    const row = el('div', 'display:flex; gap:8px;');
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const active = this.options.difficulty === d;
      const b = button(cap(d), active);
      b.style.flex = '1';
      b.onclick = (): void => { this.options = { ...this.options, difficulty: d }; this.broadcastLobby(); };
      row.append(b);
    }
    wrap.append(row);
    return wrap;
  }

  /** Apply my house pick locally (host edits its slot directly; guest tells the host). */
  private applyMyHouse(): void {
    if (this.isHost) {
      const s = this.mySlot();
      if (s) { s.house = this.myHouse; this.broadcastLobby(); }
    } else {
      this.send({ t: 'setHouse', house: this.myHouse }, this.hostId);
      this.renderControls(); // reflect the active button immediately
    }
  }
}

// ---- tiny DOM helpers ----------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css.replace(/\s+/g, ' ').trim();
  if (text !== undefined) e.textContent = text;
  return e;
}

function textField(label: string, value: string): { row: HTMLDivElement; input: HTMLInputElement } {
  const row = el('div', 'margin:8px 0;');
  row.append(el('div', 'font-size:11px; color:#8fa0ad; margin-bottom:3px;', label));
  const input = el('input', `
    width:100%; box-sizing:border-box; padding:7px 9px; font-family:monospace; font-size:13px;
    background:#0c0a05; color:#e8edf2; border:1px solid #4a4126; border-radius:4px;`);
  input.value = value;
  row.append(input);
  return { row, input };
}

function button(label: string, primary: boolean): HTMLButtonElement {
  const b = el('button', `
    flex:0 0 auto; padding:8px 14px; font-family:monospace; font-size:13px; font-weight:bold;
    cursor:pointer; border-radius:4px;
    border:1px solid ${primary ? '#9a7d2e' : '#4a4126'};
    background:${primary ? '#2a2310' : '#1a160c'}; color:${primary ? GOLD : '#cbb9a0'};`, label);
  return b;
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
