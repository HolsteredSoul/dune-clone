// Deterministic delay-lockstep session — the in-match netcode core.
//
// Model: the sim runs at a fixed tick rate (SIM_HZ). Each client tags its local commands with an
// apply-tick = currentTick + INPUT_DELAY and broadcasts them; a tick may only execute once every
// peer's command bundle for that tick has arrived. The INPUT_DELAY (≈5 ticks ≈83ms at 60Hz) is the
// jitter buffer: a client may run up to D ticks ahead before it must stall for a lagging peer.
//
// Determinism guarantees: bundles for a tick are applied in a FIXED faction order on every client;
// the empty bundle every tick doubles as the heartbeat ("tick T is complete, advance"); and a
// periodic state hash (fog-excluded) is exchanged to DETECT any divergence and halt cleanly rather
// than corrupt silently. Nothing here is wall-clock dependent — the GameLoop drives step().

import type { Faction } from '../world/defs';
import type { Transport } from './transport';
import type { Command, CommandEnvelope, NetMessage } from './protocol';

const FACTION_ORDER: Faction[] = ['player', 'enemy']; // fixed apply order → identical on all clients
const HASH_INTERVAL = 60; // exchange a desync checksum every N executed ticks (~1s at 60Hz)

export interface SessionHooks {
  apply: (env: CommandEnvelope) => void; // apply one command to the World
  advance: () => void;                    // advance the World exactly one fixed sim tick
  hash: () => number;                     // fog-excluded desync digest of the World
}

export class NetSession {
  /** Number of sim ticks already executed (the deterministic clock, identical across clients). */
  execTick = 0;
  stalled = false;
  desynced = false;
  private halted = false;

  onDesync: (tick: number) => void = () => {};
  onPeerGone: () => void = () => {};

  private readonly remoteFaction: Faction;
  private readonly localQueue: Command[] = [];
  // tick -> faction -> that faction's command bundle for the tick.
  private readonly inbox = new Map<number, Map<Faction, CommandEnvelope[]>>();
  private readonly myHashes = new Map<number, number>();
  private readonly remoteHashes = new Map<number, number>();

  constructor(
    private readonly transport: Transport,
    private readonly localFaction: Faction,
    private readonly hooks: SessionHooks,
    private readonly inputDelay = 5,
  ) {
    this.remoteFaction = localFaction === 'player' ? 'enemy' : 'player';
    // Prime the pipeline: nobody sends bundles for ticks [0, D), so seed them empty for both
    // factions. Executing those free ticks is what produces+sends the bundles for ticks [D, 2D).
    for (let t = 0; t < this.inputDelay; t++) {
      this.record(t, this.localFaction, []);
      this.record(t, this.remoteFaction, []);
    }
    // Take over the socket from the lobby for the duration of the match.
    transport.onMessage = (_from, msg): void => this.onMessage(msg);
    transport.onPeerLeave = (): void => this.peerGone();
    transport.onClose = (): void => this.peerGone();
  }

  /** Queue a locally-issued command to apply at execTick + inputDelay. */
  queue(cmd: Command): void {
    if (!this.halted) this.localQueue.push(cmd);
  }

  /** Called once per GameLoop sim step. Advances at most one tick — only when ready. */
  step(): void {
    if (this.halted) return;
    if (!this.ready(this.execTick)) { this.stalled = true; return; }
    this.stalled = false;

    // 1) Publish my bundle for the future tick (and record it locally) — also the heartbeat.
    const future = this.execTick + this.inputDelay;
    const bundle: CommandEnvelope[] = this.localQueue.map((cmd) => ({ issuingFaction: this.localFaction, cmd }));
    this.localQueue.length = 0;
    this.record(future, this.localFaction, bundle);
    this.send({ t: 'cmds', tick: future, bundle });

    // 2) Apply both factions' bundles for this tick in a fixed order (cross-client determinism).
    const slot = this.inbox.get(this.execTick);
    if (slot) {
      for (const fac of FACTION_ORDER) {
        const b = slot.get(fac);
        if (b) for (const env of b) this.hooks.apply(env);
      }
    }

    // 3) Advance the sim exactly one fixed tick.
    this.hooks.advance();
    this.inbox.delete(this.execTick);
    this.execTick++;

    // 4) Periodic desync checksum.
    if (this.execTick % HASH_INTERVAL === 0) {
      const crc = this.hooks.hash();
      this.myHashes.set(this.execTick, crc);
      this.send({ t: 'hash', tick: this.execTick, crc });
      this.compareHash(this.execTick);
    }
  }

  /** Detach from the transport (does not close the socket — the caller owns its lifecycle). */
  destroy(): void {
    this.halted = true;
    this.transport.onMessage = () => {};
    this.transport.onPeerLeave = () => {};
    this.transport.onClose = () => {};
  }

  // ---- internals --------------------------------------------------------------------------

  private ready(tick: number): boolean {
    const slot = this.inbox.get(tick);
    return !!slot && slot.has(this.localFaction) && slot.has(this.remoteFaction);
  }

  private record(tick: number, faction: Faction, bundle: CommandEnvelope[]): void {
    let slot = this.inbox.get(tick);
    if (!slot) { slot = new Map(); this.inbox.set(tick, slot); }
    if (!slot.has(faction)) slot.set(faction, bundle);
  }

  private onMessage(msg: NetMessage): void {
    if (this.halted) return;
    if (msg.t === 'cmds') {
      this.record(msg.tick, this.remoteFaction, msg.bundle);
    } else if (msg.t === 'hash') {
      this.remoteHashes.set(msg.tick, msg.crc);
      this.compareHash(msg.tick);
    }
  }

  private compareHash(tick: number): void {
    const a = this.myHashes.get(tick);
    const b = this.remoteHashes.get(tick);
    if (a !== undefined && b !== undefined && a !== b && !this.desynced) {
      this.desynced = true;
      this.halted = true;
      this.onDesync(tick);
    }
  }

  private peerGone(): void {
    if (this.halted) return;
    this.halted = true;
    this.onPeerGone();
  }

  private send(msg: NetMessage): void {
    this.transport.send(msg); // broadcast to the room (the single other peer in v1)
  }
}
