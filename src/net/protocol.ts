// Multiplayer wire protocol — the single shared contract between clients (and the dumb relay).
//
// Two layers travel over one WebSocket:
//   1. RelayFrame  — transport plumbing handled by the relay (peer join/leave, addressed forward).
//   2. NetMessage  — application messages (lobby + in-game lockstep) the relay forwards opaquely.
//
// The relay NEVER interprets a NetMessage; it only routes RelayFrames. This keeps the server
// game-agnostic (it can't cheat, needs no sim code) and lets the protocol evolve client-side only.
//
// Determinism note: nothing here runs inside world.update(). These are control/relay types only.

import type { Faction, Stance, House, Difficulty } from '../world/defs';
import type { WorldSnapshot } from '../world/world';

export const PROTOCOL_VERSION = 1;

// ---- Layer 1: relay plumbing --------------------------------------------------------------
// Frames exchanged with the relay itself. `rt` = relay-type, kept distinct from NetMessage `t`.

/** Relay -> client. */
export type RelayInbound =
  | { rt: 'welcome'; peerId: string; peers: string[] } // to the joiner: its id + who's already here (join order)
  | { rt: 'join'; peerId: string }                     // to others: a peer joined
  | { rt: 'leave'; peerId: string }                    // to others: a peer left
  | { rt: 'msg'; from: string; data: NetMessage };     // forwarded application message

/** Client -> relay. `to` addresses a single peer; omit to broadcast to all others in the room. */
export type RelayOutbound = { rt: 'msg'; to?: string; data: NetMessage };

// ---- Layer 2a: in-game lockstep commands --------------------------------------------------
// The serializable form of every sim-mutating player action. Live Unit/Building references are
// carried as ids (resolved on each client via World.findUnit / World.findBuilding at apply time).

// IMPORTANT (apply layer, Phase 2): EVERY command applies to `CommandEnvelope.issuingFaction`,
// never a hardcoded 'player'. The economy commands carry only a def/id (no building-instance
// disambiguator) because the underlying World methods act on the faction's AGGREGATE queue
// (e.g. cancelUnit(faction, defId) peels that faction's queue, not one specific producer) — which
// is exactly the lockstep-correct granularity (both clients resolve it identically from the faction
// + def). The apply switch must be exhaustive over `kind` and must NOT trust a malformed payload.
export type Command =
  | { kind: 'smart' | 'attackMove'; unitIds: number[]; wx: number; wy: number }
  | { kind: 'stop' | 'hold' | 'guard'; unitIds: number[] }
  | { kind: 'stance'; unitIds: number[]; stance: Stance }
  | { kind: 'queueUnit' | 'cancelUnit' | 'startBuilding' | 'cancelStructure'; defId: string }
  | { kind: 'placeReady'; tx: number; ty: number }
  | { kind: 'purchaseUpgrade'; id: string }
  | { kind: 'setRally'; buildingId: number; wx: number; wy: number }
  | { kind: 'clearRally' | 'toggleRepair'; buildingId: number }
  | { kind: 'pause' | 'resume' }; // coordinated across clients (never a local-only freeze)

/** A command tagged with WHO issued it and WHEN it applies. The faction comes from here, not from
 *  the payload — it replaces the hardcoded 'player' literal in the single-player command sites. */
export interface CommandEnvelope {
  issuingFaction: Faction;
  cmd: Command;
}

// ---- Layer 2b: lobby / match setup --------------------------------------------------------

export interface PlayerSlot {
  peerId: string;
  name: string;
  faction: Faction;      // v1: exactly two slots ('player' | 'enemy')
  house: House;
  ready: boolean;
  isHost: boolean;
}

export interface LobbyOptions {
  mission: string;       // mission name, or 'skirmish'
  difficulty: Difficulty;
}

/** Enemy-AI snapshot shape (mirrors EnemyAI.serialize() / game.ts SaveData.ai). Only present for
 *  a host-authoritative PvAI start; undefined for human-vs-human. */
export interface AiSnapshot {
  think: number;
  waveSize: number;
  holdUntil: number;
  attacking: boolean;
}

// ---- Layer 2: the application message union ----------------------------------------------

export type NetMessage =
  // lobby
  | { t: 'hello'; name: string; protocolVersion: number }
  | { t: 'lobbyState'; slots: PlayerSlot[]; options: LobbyOptions }
  | { t: 'setOptions'; options: Partial<LobbyOptions> }
  | { t: 'setHouse'; house: House }
  | { t: 'ready'; ready: boolean }
  | { t: 'start'; snapshot: WorldSnapshot; ai?: AiSnapshot; startTick: number; inputDelay: number;
      // The match config the guest reconstructs the World from BEFORE adopting the snapshot, so
      // both clients build a byte-identical world (then the host's snapshot is the canonical t=0).
      difficulty: Difficulty; playerHouse: House; enemyHouse: House }
  // in-game lockstep
  | { t: 'cmds'; tick: number; bundle: CommandEnvelope[] } // per-tick bundle (empty = heartbeat)
  | { t: 'hash'; tick: number; crc: number }               // periodic desync checksum
  // control
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | { t: 'desync'; tick: number };

// ---- (de)serialization -------------------------------------------------------------------
// JSON over the wire. Thin wrappers centralize the format so a binary codec can swap in later.

export function encode(frame: RelayOutbound): string {
  return JSON.stringify(frame);
}

export function decode(raw: string): RelayInbound | null {
  try {
    const v = JSON.parse(raw) as RelayInbound;
    return v && typeof v === 'object' && typeof (v as { rt?: unknown }).rt === 'string' ? v : null;
  } catch {
    return null;
  }
}
