// Command apply layer — turns a serializable CommandEnvelope back into a World mutation.
//
// This is the ONE place network commands touch the sim. It resolves unit/building IDS into live
// objects via the World's existing public findUnit/findBuilding, and routes every action to the
// envelope's issuingFaction (NEVER a hardcoded 'player'). Because the underlying World methods are
// already owner-parameterized and self-validating, applying the same envelope on two identical
// worlds produces identical results — the lockstep invariant.
//
// Defensive: a client may only command ITS OWN entities; commands referencing the other faction's
// units/buildings (or dead/missing ids) are filtered out, so a malformed/stale command is a safe
// no-op on both clients rather than a desync.

import type { World } from '../world/world';
import type { Faction } from '../world/defs';
import type { Command, CommandEnvelope } from './protocol';

function resolveUnits(world: World, ids: number[], faction: Faction) {
  const out = [];
  for (const id of ids) {
    const u = world.findUnit(id);
    if (u && u.alive && u.owner === faction) out.push(u);
  }
  return out;
}

export function applyCommand(world: World, env: CommandEnvelope): void {
  const f = env.issuingFaction;
  const cmd: Command = env.cmd;
  switch (cmd.kind) {
    case 'smart':
      world.commandSmart(resolveUnits(world, cmd.unitIds, f), cmd.wx, cmd.wy);
      break;
    case 'attackMove':
      world.commandAttackMove(resolveUnits(world, cmd.unitIds, f), cmd.wx, cmd.wy);
      break;
    case 'stop':
      world.commandStop(resolveUnits(world, cmd.unitIds, f));
      break;
    case 'hold':
      world.commandHold(resolveUnits(world, cmd.unitIds, f));
      break;
    case 'guard':
      world.commandGuard(resolveUnits(world, cmd.unitIds, f));
      break;
    case 'stance':
      world.setStance(resolveUnits(world, cmd.unitIds, f), cmd.stance);
      break;
    case 'queueUnit':
      world.queueUnit(f, cmd.defId);
      break;
    case 'cancelUnit':
      world.cancelUnit(f, cmd.defId);
      break;
    case 'startBuilding':
      world.startBuilding(f, cmd.defId);
      break;
    case 'cancelStructure':
      world.cancelStructure(f, cmd.defId);
      break;
    case 'placeReady':
      world.placeReady(f, cmd.tx, cmd.ty);
      break;
    case 'purchaseUpgrade':
      world.purchaseUpgrade(f, cmd.id);
      break;
    case 'setRally': {
      const b = world.findBuilding(cmd.buildingId);
      if (b && b.owner === f && b.isProducer) world.setRally(b, cmd.wx, cmd.wy);
      break;
    }
    case 'clearRally': {
      const b = world.findBuilding(cmd.buildingId);
      if (b && b.owner === f && b.isProducer) world.clearRally(b);
      break;
    }
    case 'toggleRepair': {
      const b = world.findBuilding(cmd.buildingId);
      if (b && b.owner === f) world.toggleRepair(b);
      break;
    }
    case 'pause':
    case 'resume':
      // Coordinated pause is out of scope for v1 (MP disables the local pause toggle). No-op.
      break;
  }
}

// ---- desync hash --------------------------------------------------------------------------
// A cheap order-stable digest of the full sim state, EXCLUDING per-viewer fog (each client
// computes fog from its own localFaction, so fog legitimately differs and must not be hashed).
// serialize() already drops the transient/cosmetic queues (projectiles/effects/popups/audio), so
// the rest is the authoritative deterministic state. FNV-1a 32-bit — fast enough at ~1 Hz.

export function hashWorld(world: World): number {
  const snapshot = world.serialize();
  const json = JSON.stringify({ ...snapshot, fog: undefined }); // fog omitted (undefined → dropped)
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
