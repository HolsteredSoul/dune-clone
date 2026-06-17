// Dune_Clone multiplayer RELAY — a tiny, game-agnostic WebSocket broadcast hub.
//
// It never interprets game messages: it groups connections into rooms (by the `room` query param)
// and forwards each client's payloads to the other members of the same room, plus join/leave
// presence. Because it holds no sim code it cannot cheat, desync, or fall behind — it is pure I/O.
//
// This is a standalone Node tool, NOT part of the client bundle (it lives outside `src/`, so the
// `tsc --noEmit` build never sees it and `vite build` never ships it — the GitHub-Pages deploy and
// single-player play are completely unaffected). It mirrors scripts/sim.ts: esbuild-bundled, run
// via `npm run relay`. Only the HOST runs it; joiners just point their client at ws://host:PORT.
//
// Run:  npm run relay            (defaults to port 8787)
//       PORT=9000 npm run relay  (or: npm run relay -- 9000)

import { WebSocketServer } from 'ws';

// `ws` socket — typed loosely because this file is intentionally outside the typed `src` project
// (no @types/ws dependency, matching scripts/sim.ts's untyped node-tool precedent).
type Sock = {
  send(data: string): void;
  close(): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  readyState: number;
};

const OPEN = 1; // ws.OPEN

const PORT = Number(process.env.PORT ?? process.argv[2] ?? 8787);
const MAX_PAYLOAD = 8 * 1024 * 1024; // 8 MB — generous headroom for the initial world snapshot

// room id -> (peerId -> socket), insertion-ordered so the first joiner is the natural host.
const rooms = new Map<string, Map<string, Sock>>();
let nextPeer = 1;

function send(sock: Sock, obj: unknown): void {
  if (sock.readyState === OPEN) sock.send(JSON.stringify(obj));
}

const wss = new WebSocketServer({ port: PORT, maxPayload: MAX_PAYLOAD });

wss.on('connection', (sock: Sock, req: { url?: string }) => {
  // Parse ?room= & ?name= (defaults keep a bare connection usable for smoke tests).
  const url = new URL(req.url ?? '/', 'http://localhost');
  const roomId = url.searchParams.get('room') ?? 'lobby';
  const name = url.searchParams.get('name') ?? 'player';

  let room = rooms.get(roomId);
  if (!room) { room = new Map(); rooms.set(roomId, room); }

  const peerId = `p${nextPeer++}`;
  const existing = [...room.keys()]; // who's already here (join order) — first is the host
  room.set(peerId, sock);

  // Tell the joiner its id + current members; tell everyone else a peer joined.
  send(sock, { rt: 'welcome', peerId, peers: existing });
  for (const [id, s] of room) if (id !== peerId) send(s, { rt: 'join', peerId });
  log(`+ ${peerId} (${name}) -> room "${roomId}" [${room.size}]`);

  sock.on('message', (raw: unknown) => {
    let frame: { rt?: string; to?: string; data?: unknown };
    try { frame = JSON.parse(String(raw)); } catch { return; }
    if (!frame || frame.rt !== 'msg') return; // only message frames are relayed
    const forward = { rt: 'msg', from: peerId, data: frame.data };
    const r = rooms.get(roomId);
    if (!r) return;
    if (frame.to) {
      const target = r.get(frame.to); // addressed: deliver to one peer only
      if (target) send(target, forward);
    } else {
      for (const [id, s] of r) if (id !== peerId) send(s, forward); // broadcast to others
    }
  });

  const drop = (): void => {
    const r = rooms.get(roomId);
    if (!r || !r.has(peerId)) return;
    r.delete(peerId);
    for (const [, s] of r) send(s, { rt: 'leave', peerId });
    if (r.size === 0) rooms.delete(roomId);
    log(`- ${peerId} (${name}) <- room "${roomId}" [${r.size}]`);
  };
  sock.on('close', drop);
  sock.on('error', drop);
});

function log(msg: string): void {
  // Lightweight timestamped line (Date is fine here — this is the server, not the sim).
  process.stdout.write(`[relay] ${msg}\n`);
}

process.stdout.write(`[relay] listening on ws://localhost:${PORT}  (room broadcast hub)\n`);
process.stdout.write(`[relay] joiners connect to ws://<this-machine-ip>:${PORT}\n`);
