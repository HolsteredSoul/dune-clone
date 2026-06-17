// Headless two-client lockstep determinism test. Spins up TWO real clients (RelayTransport +
// NetSession + World) in one node process, connected to the running relay (npm run relay), runs the
// actual delay-lockstep, injects a few commands from each side, and asserts the two Worlds stay
// byte-identical (fog-excluded hash) with no desync. This is the Phase-2/3 verification AND the
// Phase-4 headless cross-check. Run: esbuild-bundle then node (see the inline command below).
//
//   esbuild scripts/nettest.ts --bundle --platform=node --format=esm --outfile=scripts/nettest.mjs && node scripts/nettest.mjs

import { World } from '../src/world/world';
import { NetSession } from '../src/net/session';
import { RelayTransport, relayUrl } from '../src/net/transport';
import { applyCommand, hashWorld } from '../src/net/commands';
import { makeSkirmishConfig } from '../src/game/missions';
import { TILE } from '../src/world/constants';
import type { House } from '../src/world/defs';
import type { MissionConfig } from '../src/world/world';

const URL = 'ws://localhost:8787';
const ROOM = 'nettest';
const DELAY = 5;
const TARGET = 400; // ticks (~6.7s of sim at 60Hz)

function makeMpConfig(playerHouse: House, enemyHouse: House): MissionConfig {
  return { ...makeSkirmishConfig('balanced'), playerHouse, enemyHouse };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  // Connect host first (→ becomes host), then guest.
  const tHost = new RelayTransport(relayUrl(URL, ROOM, 'host'));
  await tHost.connect();
  const tGuest = new RelayTransport(relayUrl(URL, ROOM, 'guest'));
  await tGuest.connect();
  console.log(`host peers=${JSON.stringify(tHost.peers)}  guest peers=${JSON.stringify(tGuest.peers)}`);
  if (tHost.peers.length !== 0 || tGuest.peers.length !== 1) throw new Error('host/guest role detection failed');

  // Host builds the canonical world; guest rebuilds + adopts the snapshot (the real launch path).
  const cfg = makeMpConfig('atreides', 'harkonnen');
  const hostWorld = new World(cfg, 'normal', 'atreides');
  const snapshot = hostWorld.serialize();
  const guestWorld = new World(cfg, 'normal', 'atreides');
  guestWorld.deserialize(snapshot);
  hostWorld.localFaction = 'player';
  guestWorld.localFaction = 'enemy';

  // Confirm identical starting state (the snapshot sync) before any ticks.
  if (hashWorld(hostWorld) !== hashWorld(guestWorld)) throw new Error('initial snapshot sync FAILED: worlds differ at t=0');
  console.log(`t=0 snapshot sync OK (hash ${hashWorld(hostWorld)})`);

  let hostDesync = -1, guestDesync = -1;
  const mkSession = (t: RelayTransport, w: World, faction: 'player' | 'enemy') => {
    const s = new NetSession(t, faction, {
      apply: (env) => applyCommand(w, env),
      advance: () => w.update(1 / 60),
      hash: () => hashWorld(w),
    }, DELAY);
    return s;
  };
  const hostSess = mkSession(tHost, hostWorld, 'player');
  const guestSess = mkSession(tGuest, guestWorld, 'enemy');
  hostSess.onDesync = (t) => { hostDesync = t; };
  guestSess.onDesync = (t) => { guestDesync = t; };

  const aUnit = hostWorld.units.find((u) => u.owner === 'player' && !u.def.harvester);
  if (!aUnit) throw new Error('no player combat unit to command');
  const hostCreditsBefore = hostWorld.player.credits;
  const enemyCreditsBefore = hostWorld.enemy.credits;

  // Drive the lockstep. One step per session per iteration, yielding so relay messages flow.
  let iter = 0;
  let injA = false, injB = false, injC = false;
  while ((hostSess.execTick < TARGET || guestSess.execTick < TARGET) && iter < TARGET * 20
         && hostDesync < 0 && guestDesync < 0) {
    iter++;
    // Host moves a player unit; guest (the 'enemy' faction) queues a unit + the host builds power.
    if (!injA && hostSess.execTick >= 20) { hostSess.queue({ kind: 'smart', unitIds: [aUnit.id], wx: 30 * TILE, wy: 30 * TILE }); injA = true; }
    if (!injB && guestSess.execTick >= 25) { guestSess.queue({ kind: 'queueUnit', defId: 'infantry' }); injB = true; }
    if (!injC && hostSess.execTick >= 40) { hostSess.queue({ kind: 'startBuilding', defId: 'power' }); injC = true; }
    hostSess.step();
    guestSess.step();
    await sleep(0); // let the ws round-trip through the relay
  }

  // ---- assertions ----
  const hHash = hashWorld(hostWorld), gHash = hashWorld(guestWorld);
  const fail = (m: string) => { console.error('FAIL:', m); process.exit(1); };

  console.log(`\nran ${iter} iters → host tick ${hostSess.execTick}, guest tick ${guestSess.execTick}`);
  console.log(`final hash: host ${hHash}  guest ${gHash}`);
  if (hostDesync >= 0 || guestDesync >= 0) fail(`desync detected (host@${hostDesync} guest@${guestDesync})`);
  if (hostSess.execTick < TARGET || guestSess.execTick < TARGET) fail('did not reach target tick (stalled)');
  if (hHash !== gHash) fail('worlds DIVERGED after lockstep (hash mismatch)');

  // Prove commands actually mutated the sim (not a trivially-equal pair of idle worlds).
  const movedUnit = hostWorld.findUnit(aUnit.id);
  const movedOnHost = !!movedUnit && movedUnit.order.kind !== 'idle';
  const movedOnGuest = (() => { const u = guestWorld.findUnit(aUnit.id); return !!u && u.order.kind !== 'idle'; })();
  const hostBuiltPower = !!hostWorld.player.building || hostWorld.buildings.filter((b) => b.owner === 'player').length > 3;
  const enemyQueuedOrSpent = guestWorld.enemy.credits !== enemyCreditsBefore
    || [...guestWorld.enemy.unitQueues.values()].some((q) => q.length > 0);
  console.log(`commands applied → unit moved (host ${movedOnHost}, guest ${movedOnGuest}); `
    + `host power-build ${hostBuiltPower}; enemy queue/credits changed ${enemyQueuedOrSpent}`);
  console.log(`credits drifted from start: host ${hostCreditsBefore}->${hostWorld.player.credits}, enemy ${enemyCreditsBefore}->${hostWorld.enemy.credits}`);
  if (!movedOnHost || !movedOnGuest) fail('the move command did not take effect on both clients');
  if (!enemyQueuedOrSpent) fail('the guest queueUnit command did not take effect');

  console.log('\nLOCKSTEP DETERMINISM: PASS');
  tHost.close(); tGuest.close();
  process.exit(0);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
