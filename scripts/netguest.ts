// Headless full multiplayer PARTICIPANT for live browser E2E. Joins a room as the guest, does the
// real lobby handshake (hello → ready), then on the host's 'start' builds the identical world and
// plays the deterministic lockstep (idle — just heartbeats), logging hashes + any desync. Lets a
// browser HOST run a genuine cross-client match against a real second client.
//
//   esbuild scripts/netguest.ts --bundle --platform=node --format=esm --outfile=scripts/netguest.mjs && node scripts/netguest.mjs <room>

import { World } from '../src/world/world';
import { NetSession } from '../src/net/session';
import { RelayTransport, relayUrl } from '../src/net/transport';
import { applyCommand, hashWorld } from '../src/net/commands';
import { makeSkirmishConfig } from '../src/game/missions';
import type { House } from '../src/world/defs';
import type { MissionConfig } from '../src/world/world';
import type { NetMessage } from '../src/net/protocol';
import { PROTOCOL_VERSION } from '../src/net/protocol';

const URL = 'ws://localhost:8787';
const ROOM = process.argv[2] ?? 'live';
const log = (m: string) => console.log('[netguest]', m);

function mpConfig(playerHouse: House, enemyHouse: House): MissionConfig {
  return { ...makeSkirmishConfig('balanced'), playerHouse, enemyHouse };
}

async function main(): Promise<void> {
  const t = new RelayTransport(relayUrl(URL, ROOM, 'NodeGuest'));
  await t.connect();
  if (t.peers.length === 0) { log('connected as HOST (no peers) — expected the browser to host; exiting'); process.exit(1); }
  const hostId = t.peers[0];
  log(`connected as guest; host=${hostId}`);

  let readied = false;
  let world: World | null = null;
  let session: NetSession | null = null;

  t.onMessage = (_from, msg: NetMessage): void => {
    if (msg.t === 'lobbyState') {
      log(`lobbyState: ${msg.slots.map((s) => `${s.name}/${s.faction}/${s.ready ? 'R' : '-'}`).join(', ')}`);
      if (!readied) { readied = true; t.send({ t: 'ready', ready: true }, hostId); log('sent ready'); }
    } else if (msg.t === 'start') {
      log('host started the match — building world + lockstep session');
      world = new World(mpConfig(msg.playerHouse, msg.enemyHouse), msg.difficulty, msg.playerHouse);
      world.deserialize(msg.snapshot);
      world.localFaction = 'enemy';
      world.recomputeFog();
      const w = world;
      session = new NetSession(t, 'enemy', {
        apply: (env) => applyCommand(w, env),
        advance: () => w.update(1 / 60),
        hash: () => hashWorld(w),
      }, msg.inputDelay);
      session.onDesync = (tick) => log(`!!! DESYNC at tick ${tick}`);
      session.onPeerGone = () => { log('host gone'); process.exit(0); };
      // Drive the lockstep at ~60Hz; report progress every ~second.
      const timer = setInterval(() => {
        const s = session;
        if (!s) return;
        s.step();
        if (s.execTick % 10 === 0 && s.execTick > 0) log(`tick ${s.execTick}  hash ${hashWorld(w)}  ${s.stalled ? '(stalled)' : ''}  desync=${s.desynced}`);
      }, 1000 / 60);
      // Auto-exit after 120s so the test is bounded.
      setTimeout(() => { clearInterval(timer); log(`done @tick ${session?.execTick} desync=${session?.desynced}`); process.exit(0); }, 120000);
    }
  };

  // Kick off the lobby handshake.
  t.send({ t: 'hello', name: 'NodeGuest', protocolVersion: PROTOCOL_VERSION }, hostId);
  log('sent hello');
}

main().catch((e) => { console.error('[netguest] FAIL:', e.message); process.exit(1); });
