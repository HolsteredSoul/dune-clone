// Client transport: a thin wrapper over the browser WebSocket that speaks the relay's RelayFrame
// plumbing and surfaces application NetMessages + peer presence to the session/lobby layer.
//
// Hidden behind the `Transport` interface so a WebRTC implementation can swap in later (v2)
// without the session/lobby knowing. Nothing here touches the simulation — it is pure I/O.

import type { NetMessage, RelayInbound } from './protocol';
import { encode, decode } from './protocol';

export interface Transport {
  /** This client's relay-assigned peer id (null until connected). */
  readonly peerId: string | null;
  /** Peer ids currently in the room, in join order (empty/[] until connected). */
  readonly peers: readonly string[];
  /** Open the connection; resolves once the relay has assigned a peer id (the 'welcome'). */
  connect(): Promise<void>;
  /** Send an application message to all other peers, or to a single peer when `to` is given. */
  send(data: NetMessage, to?: string): void;
  /** Close the connection. */
  close(): void;

  // Event callbacks (assign before connect()). Defaults are no-ops.
  onMessage: (from: string, data: NetMessage) => void;
  onPeerJoin: (peerId: string) => void;
  onPeerLeave: (peerId: string) => void;
  onClose: (clean: boolean) => void;
}

/** Build a relay ws:// URL with room + display name as query params. */
export function relayUrl(base: string, room: string, name: string): string {
  const u = new URL(base);
  u.searchParams.set('room', room);
  u.searchParams.set('name', name);
  return u.toString();
}

export class RelayTransport implements Transport {
  peerId: string | null = null;
  peers: string[] = [];

  onMessage: (from: string, data: NetMessage) => void = () => {};
  onPeerJoin: (peerId: string) => void = () => {};
  onPeerLeave: (peerId: string) => void = () => {};
  onClose: (clean: boolean) => void = () => {};

  private ws: WebSocket | null = null;

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let opened = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onmessage = (ev: MessageEvent): void => {
        const frame = typeof ev.data === 'string' ? decode(ev.data) : null;
        if (!frame) return;
        // The first frame is always 'welcome' — it carries our id and resolves connect().
        if (!opened && frame.rt === 'welcome') {
          opened = true;
          this.peerId = frame.peerId;
          this.peers = [...frame.peers];
          resolve();
          return;
        }
        this.handle(frame);
      };
      ws.onerror = (): void => {
        if (!opened) reject(new Error('relay connection failed'));
      };
      ws.onclose = (ev: CloseEvent): void => {
        if (!opened) { reject(new Error('relay connection closed before welcome')); return; }
        this.ws = null;
        this.onClose(ev.wasClean);
      };
    });
  }

  private handle(frame: RelayInbound): void {
    switch (frame.rt) {
      case 'join':
        if (!this.peers.includes(frame.peerId)) this.peers.push(frame.peerId);
        this.onPeerJoin(frame.peerId);
        break;
      case 'leave':
        this.peers = this.peers.filter((p) => p !== frame.peerId);
        this.onPeerLeave(frame.peerId);
        break;
      case 'msg':
        this.onMessage(frame.from, frame.data);
        break;
      // 'welcome' is handled in connect(); a duplicate is ignored.
    }
  }

  send(data: NetMessage, to?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encode({ rt: 'msg', to, data }));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
