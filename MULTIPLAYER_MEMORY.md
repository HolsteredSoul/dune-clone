# MULTIPLAYER_MEMORY — Dune_Clone networked multiplayer

Single source of truth for the **additive multiplayer layer**. The base game's memory lives in
`PROJECT_MEMORY.md` (do NOT overwrite it). This file is updated at the end of every multiplayer
session that changes things.

## Goal
Add **networked multiplayer (2–4 players)** to Dune_Clone as a **purely additive layer**, with
**no modification/refactor of the core game framework, architecture, game logic, or tech stack**
(TypeScript + HTML5 Canvas + Vite). Deliver a clean, minimal first working version: host/join
lobby, player options, and synchronized gameplay over a real network.

## Status (read first; update at session end)
- **▶ Current phase:** **v1 FUNCTIONAL — Phases 0–3 COMPLETE + verified (desync detection from
  Phase 4 also landed).** A real, synchronized 2-player networked skirmish works end-to-end.
- **Decisions LOCKED (2026-06-17):** D1 = **2-player human-vs-human first** (3–4 deferred). D2 =
  **WebSocket relay** (`ws`). D3 = **minimal surgical seams OK** (SP behavior stays identical — proven).
- **Last done:** **Phase 2 + 3 — deterministic lockstep + initial-state snapshot sync.** New
  `src/net/commands.ts` (apply a `CommandEnvelope` to the World, ids→objects via `findUnit`/
  `findBuilding`, routing `issuingFaction`; + `hashWorld` fog-excluded digest) and `src/net/session.ts`
  (`NetSession`: delay-lockstep gate — per-tick faction-tagged command bundles, INPUT_DELAY=5,
  stall-until-ready, fixed faction apply-order, periodic CRC desync check + halt). `game.ts`:
  `localFaction` + `net` fields, `emit()` indirection (apply-now in SP / schedule+broadcast in MP),
  `step()` net gate, `advanceTick`/`checkResult` (guest sees flipped won/lost), host+guest match
  launch (`onMatchStart` → build canonical world / rebuild+deserialize → `startNet`), pause+save
  disabled in MP, peer-disconnect → title. `world.ts`: presentation-only `localFaction` (fog source)
  + `recomputeFog()`. `renderer.ts`/`ui.ts`: every `'player'` perspective site parameterized by
  `localFaction` (default 'player' ⇒ SP byte-identical). `lobby.ts`: guest `start` handler + host
  `houses` in `MatchSetup` + `handOff()` (keep socket for the session). `protocol.ts` `start` carries
  difficulty+houses. **Verified — see the checklist below: definitive headless determinism
  (`npm run nettest` PASS, host==guest hash @ tick 400, commands apply both sides, 0 desync); SP
  30-run ladder in-band (balance untouched); browser host launches + lockstep advances + command
  applies + disconnect→title; build clean; deploy-safe.**
- **Next action (v1 hardening / v2):** (1) a real **two-machine / two-browser playtest** (the in-harness
  preview can't sustain rAF — see the verification note — so guest-PERSPECTIVE rendering is wired +
  logically verified but not pixel-screenshotted; cross-MACHINE float determinism is unproven on
  differing CPUs — the CRC halt is the safety net). (2) Optional: coordinated pause, in-match quit,
  REMATCH, reconnect. (3) **3–4 players** = the deferred pervasive owner-model refactor (its own plan).

## Key findings (audit + independent verification)
1. **The sim is deterministic at runtime.** No `Math.random`/`Date.now`/`performance.now`/`crypto`
   in `world.update`, `ai.update`, unit/building/projectile update, or A*. Pure f64 over
   insertion-ordered arrays. `scripts/sim.ts` already drives this exact headless sim. → **Lockstep
   is viable with ZERO seeded-PRNG shim and zero game-logic change.**
2. **Only randomness is map generation (construction-time):** `tilemap.ts` `generateTerrain`
   (line ~41) + `stampSpice` (lines ~51/54). Sidestepped by host-snapshot init sync (below); never
   regenerated on a joiner.
3. **Command seam is clean.** `game.ts` funnels all player intent through ~16 `world.commandX()` /
   `queueUnit` / `startBuilding` / `placeReady` / `purchaseUpgrade` / `setRally` / `toggleRepair`
   calls → a single tagged-union `Command`. 6 unit-targeting + 3 building methods take live object
   refs; the net layer resolves ids→objects via the EXISTING public `findUnit()`/`findBuilding()`
   so `world.ts` need not change.
4. **Initial state sync = host serialize → broadcast → clients deserialize.** Reuses the existing
   save/load `serialize()`/`deserialize()` (terrain+spice+fog+players+entities, ids preserved,
   transient FX dropped). Byte-lossless per PROJECT_MEMORY. The construct-then-deserialize sequence
   already exists in `game.ts` `begin()`/`quickLoad()`.
5. **Owner model is 2-sided.** `type Faction = 'player' | 'enemy'` baked into ~193 sites / 9 files;
   World owns exactly two `Player`s; victory/fog/AI/`makeSkirmishConfig` assume one-vs-one.
   → **2-player human-vs-human is constraint-clean; 3–4-player FFA is a pervasive refactor** (the
   one thing that conflicts with "no large refactor").

## Architecture decisions (multiplayer)
- **Netcode: deterministic DELAY-LOCKSTEP + host-snapshot init + periodic hash desync check.**
  Relay only the tiny per-tick command bundles; input delay D≈4–6 ticks; a tick stalls until every
  peer's bundle for it has arrived. Reuses the deterministic fixed-timestep sim; the existing
  `GameLoop` (`loop.ts`) is UNCHANGED — a net "gate" wraps the `game.step` callback at `main.ts:44`
  and makes a starved tick a no-op.
- **Transport: WebSocket RELAY** (Node + `ws`, one devDep). A dumb broadcast hub (`server/relay.ts`,
  run via a new `npm run relay`, esbuild-bundled like `sim.ts`). Clients dial OUT → no NAT/ICE/TURN.
  Never imported by `dist` → **GitHub-Pages static deploy unaffected**; single-player needs nothing
  new. WebRTC P2P is a deferred v2 option.
- **Initial state:** host `world.serialize()` (+ `ai.serialize()` if PvAI) shipped in the lobby
  `start` message; clients construct the World for the agreed (mission, difficulty, house) then
  `deserialize()`.
- **Desync detection:** CRC32 of the serialized snapshot every ~30 ticks, EXCLUDING the
  cosmetic/`IN_BROWSER`-gated fields (`popups`, `audioEvents`, `effects`, `hitFlash`, `muzzleFlash`).
  On mismatch: surface a toast + halt (diagnosable, not silent corruption).
- **Pause is coordinated**, not local — a relayed `pause/resume` command (a local overlay freeze
  would desync the tick counter, since `step()` early-returns on any overlay).
- **Local-only (never relayed):** selection, camera, minimap jump, quick save/load, mute.
- **Clean separation:** all new code under `src/net/*` and `server/`. SP code paths remain reachable
  and unchanged when no session is attached / `localFaction === 'player'`.

## New files (additive)
| File | Role |
|---|---|
| `src/net/protocol.ts` | tagged-union `Command` / `NetMessage` / envelope types + (de)serialize |
| `src/net/transport.ts` | thin `WebSocket` client wrapper behind an interface (WebRTC-swappable) |
| `src/net/session.ts` | the net gate: tick counter, input-delay scheduling, stall-until-ready, apply, hash check |
| `src/net/commands.ts` | `Command`→`World` apply (resolves ids via `findUnit/findBuilding`, routes `issuingFaction`) |
| `src/net/lobby.ts` | lobby state machine + minimal host/join + options + ready/start screen |
| `server/relay.ts` | Node `ws` broadcast hub; `npm run relay` |

## Minimal hooks into existing files (kept surgical; SP behavior identical)
1. `main.ts:44` — wrap the `game.step` callback in the net gate (additive).
2. `game.ts` — route command emission through an indirection (apply-now in SP, schedule-via-session
   in MP) + a `localFaction` field replacing hardcoded `'player'` literals; the AI driver becomes
   session-controlled (off in PvP, host-authoritative in PvAI).
3. `world.ts` — TARGET: untouched (ids resolved in the net layer). Fallback only if ergonomics force
   it: convert 6 `Unit[]`→`number[]` + 3 `Building`→`id` signatures (signature-level, not logic).

## Phase plan (each ends green + demoable)
- [x] **Phase 0 — Transport foundation.** ✅ `ws` devDep, `server/relay.ts`, `npm run relay`,
  `src/net/transport.ts` + `protocol.ts`. *Done:* live 3-client relay round-trip PASS
  (welcome/join/broadcast/addressed/isolation/leave); `npm run build` clean; relay not in `dist`.
- [x] **Phase 1 — Lobby / options.** ✅ `src/net/lobby.ts` (DOM overlay) + title seam (`MULTIPLAYER`
  item in ui.ts, `openMultiplayer`/`onMatchStart` in game.ts). Host-authoritative slot list; live
  presence/house/ready sync; difficulty picker; START gated on all-ready. *Done:* live 2-instance
  session (browser host + node guest) synced join/house/ready; START handed a correct `MatchSetup`
  to the controller; title + lobby render verified; build clean; no errors. *Honest scope:* the
  lobby SETUP is fully synchronized + START fires `onMatchStart`; the actual networked match LAUNCH
  (build world → broadcast snapshot → lockstep) is Phases 2–3 (it needs the world + apply layer).
- [x] **Phase 2 — Command relay + tick sync.** ✅ `src/net/session.ts` (`NetSession` delay-lockstep
  gate) + `src/net/commands.ts` (`applyCommand`). `world.ts` command signatures were NOT changed —
  ids are resolved in the apply layer via the existing public `findUnit`/`findBuilding` (even more
  non-invasive than the audit's plan). `game.ts` `emit()` indirection + `step()` gate; AI off for PvP.
  The net gate lives in `game.step` (NOT `main.ts:44` — `main.ts` is untouched). *Done:* a move/build
  on one client applies identically on both (headless nettest + browser). **Coordinated pause was
  descoped for v1** — MP disables the local pause (a freeze would just stall both peers).
- [x] **Phase 3 — Initial state sync.** ✅ Host `world.serialize()` shipped in `start`; guest
  `new World(cfg,diff,house)` then `deserialize()` (reuses the save/load construct-then-deserialize
  path). *Done:* `npm run nettest` confirms a byte-identical t=0 world (matching hash) even though
  each client's fresh `new World` rolls a DIFFERENT random map — the host snapshot is canonical.
- [~] **Phase 4 — Desync detection (LANDED) + hardening (partial).** ✅ Fog-excluded `hashWorld`
  CRC exchanged every 60 ticks; mismatch → `onDesync` toast + halt. ✅ Headless 2-client cross-check
  `scripts/nettest.ts` (`npm run nettest`): host==guest hash + commands apply + 0 desync over 400
  ticks. **Remaining (v1 hardening / v2):** two-MACHINE cross-CPU playtest, PvAI variant, reconnect/
  rematch, coordinated pause. `scripts/netguest.ts` = a manual full participant for browser E2E.

## Decisions (RESOLVED 2026-06-17)
- **D1 — v1 player count:** ✅ **2-player human-vs-human** (3–4 deferred to a v2 owner-model refactor).
- **D2 — Transport:** ✅ **WebSocket relay** (`ws`).
- **D3 — Seam invasiveness:** ✅ **minimal surgical seams** — and in the end `world.ts` got only a
  presentation-only `localFaction`+`recomputeFog` (no command-signature changes); `main.ts` untouched.

## Known risks (ranked)
1. **Cross-machine float desync** (transcendentals in combat). Mitigation: periodic state-hash
   detector + halt; headless cross-check proves logical determinism. Ship + measure.
2. **Pause/tick divergence.** Mitigation: relayed pause, never local freeze.
3. **>2-owner scope creep.** Mitigation: hard-line v1 at 2 players; owner-model widening is a
   dedicated, explicitly-approved follow-up.
4. **Lag-spike stalls** (delay-lockstep). Mitigation: tune D; empty `cmds` heartbeats every tick;
   "waiting for player…" indicator.
5. **NAT/hosting friction.** Mitigation: relay (clients dial out); host runs `npm run relay`.
6. **Static-deploy regression** if relay/`ws` leak into client code. Mitigation: keep under
   `server/`, esbuild-bundle separately, never import from `src/`; CI build is the guardrail.

## Verification checklist (v1 status)
- [x] `npm run build` clean (tsc strict + vite) — bundle 120 kB, no `ws`/`server` code in `dist`.
- [x] `npm run sim` ≥30 runs in-band vs baseline (Easy 97/100/100/100, Normal 67/53/40/70, Hard
      73/67/40/17, skirmish balanced 100/93/100, passive 100% loss) — **SP balance untouched**.
- [x] Headless two-client cross-check `npm run nettest` — host==guest hash @ tick 400, commands
      apply both sides, 0 desync, t=0 snapshot sync OK (across differing random maps).
- [x] Browser host E2E — launches into a synced match, lockstep advances (stall-correct), a command
      applies through the relay, peer-disconnect → title; SP skirmish still plays; no console errors.
- [x] GitHub-Pages single-player deploy unaffected (relay outside `src`, never in `dist`).
- [ ] **Two-MACHINE / two-browser playtest** (cross-CPU float determinism; guest-perspective pixels)
      — NOT runnable in-harness (rAF paused in the backgrounded preview); the CRC halt is the net.

> ⚠ Harness verification note (same as the base game): the in-harness preview is a BACKGROUNDED tab,
> so `requestAnimationFrame` is paused — the game loop doesn't tick on its own and live screenshots
> time out. Sim logic was verified by stepping `game.step()` directly via `preview_eval` and by the
> headless node clients (`nettest`/`netguest`), which run the real World+NetSession+transport.

## Session log (newest first)
- **2026-06-17 — Phase 2 + 3 (+ Phase 4 desync): deterministic lockstep, the v1 core.** The
  networked match now actually runs synchronized. New `src/net/commands.ts` — `applyCommand(world,
  env)` resolves `unitIds`/`buildingId` to objects via the existing public `findUnit`/`findBuilding`
  (so **`world.ts` command signatures were NOT changed** — strictly more non-invasive than the
  audit's `Unit[]→id` plan), routes `env.issuingFaction` (defensively filters to that faction's own
  entities), + `hashWorld` (FNV-1a over `serialize()` minus per-viewer fog). New `src/net/session.ts`
  — `NetSession`: delay-lockstep (INPUT_DELAY=5), per-tick faction-tagged `cmds` bundles (empty =
  heartbeat), pre-seeded free ticks [0,D), stall-until-both-bundles, FIXED faction apply order, GC'd
  inbox, CRC desync exchange every 60 ticks → `onDesync` halt, `onPeerGone` on disconnect; takes over
  the transport from the lobby. `game.ts`: `localFaction`+`net` fields; `emit(cmd)` (apply-now in SP
  via `applyCommand` / `net.queue` in MP) replacing every direct `world.commandX` call site;
  `step()` routes to `net.step()` (gate→`advanceTick`=`world.update(1/SIM_HZ)`+`checkResult`) in MP;
  `checkResult` flips won/lost for the guest (`world.result` stays player-centric+deterministic);
  `onMatchStart` host (build canonical world → `serialize` → send `start` → `startNet`) + guest
  (build same cfg → `deserialize(snapshot)` → `startNet`); selection/production/placement/rally all
  keyed to `localFaction`; pause + quick save/load disabled in MP; peer-gone/`advanceOverlay` →
  `endNetToTitle`. `world.ts`: presentation-only `localFaction` (fog source) + public
  `recomputeFog()` — **no sim-logic change**. `renderer.ts`/`ui.ts`: a per-instance `localFaction`
  (set per `draw()`, default 'player') replaces every `=== 'player'` owner-color / fog-gate /
  sidebar / top-bar / minimap site ⇒ each client views its own side as friendly. `lobby.ts`: guest
  `start` handler → `onStart` with the snapshot; host puts both `houses` in `MatchSetup`; `handOff()`
  hides the DOM but KEEPS the socket for the session. `protocol.ts` `start` now carries
  difficulty+playerHouse+enemyHouse. New `scripts/nettest.ts` (`npm run nettest`, needs the relay) +
  `scripts/netguest.ts` (manual browser-E2E participant). **Verified:** `npm run build` clean (120 kB,
  no server/ws in dist); **`npm run nettest` PASS** — t=0 snapshot sync OK + host==guest hash @ tick
  400 + commands apply both sides + 0 desync (re-run with a different random map: still matches);
  **30-run sim ladder in-band** (SP balance untouched — the only `world.ts` change is view-only fog);
  **browser host E2E** via `preview_eval` + a live node participant through the relay — host launches
  into a synced match (`overlay=none`, `net`, `localFaction=player`, symmetric 3v3), lockstep
  ratchets 5→15→25→…→55 with correct stall behavior and `desync=false`, an in-browser
  `startBuilding('power')` applies (credits 3520→3220, `player.building='power'`), and killing the
  participant returns the host to the title; SP skirmish still steps + renders; zero console errors.
  Lesson: the in-harness preview can't sustain a real-time MP match (rAF paused) — drove `game.step`
  manually + used headless node clients as the second player. **Committed + pushed to origin/main
  (e1c772e)** alongside the README/CLAUDE/PROJECT_MEMORY doc updates (live link + multiplayer how-to).
- **2026-06-17 — Phase 1: lobby / options.** New `src/net/lobby.ts` — a self-contained DOM overlay
  (no `index.html` change; inline styles) owning the `Transport` + a host-authoritative lobby state
  machine. Connect screen (name / relay URL / room) → lobby screen (slot list, own House picker, host
  difficulty picker, ready/START + leave). Handshake: first peer in a room = host; guests send
  `hello`/`ready`/`setHouse` addressed to the host; host seats them (player+enemy), assigns faction,
  rebroadcasts `lobbyState`; v1 caps at 2 (reuses `desync{tick:-1|-2}` as version/full rejects).
  START (gated on 2/2 ready) builds a `MatchSetup` and calls `onStart`. Seams (minimal, per D3):
  ui.ts `drawTitle` gained a `MULTIPLAYER` item (data-driven menu, `hitTestTitle` unchanged);
  game.ts gained `import Lobby/MatchSetup`, a lazy `lobby` field, an `openMultiplayer()` from the
  title branch, and `onMatchStart()` (Phase 1: logs + closes; the world/snapshot handoff is Phase 3).
  **No sim file touched** (`scripts/sim.ts` imports neither game.ts/ui.ts/net — SP balance unaffected
  by construction, no sim run needed). Added `.claude/launch.json` "dev" already existed (preview
  tooling). Verified: `npm run build` clean (bundle 103→114 kB from the now-wired lobby; still no
  `ws`/server code in `dist`); a live REAL 2-instance session through the relay (browser host via
  `window.game.openMultiplayer()` + a headless node `ws` guest) synced join→2/2, guest setHouse +
  ready, START-enable-on-both-ready, and START → `onMatchStart` with the right faction/options/slots;
  title + lobby screenshots render on-theme; zero console errors. Also incorporated the Phase-0
  adversarial review (deploy-safe, no blockers; actioned the one `protocol.ts` apply-routing note).
- **2026-06-17 — Phase 0: transport foundation.** Created `src/net/protocol.ts` (RelayFrame
  plumbing + `NetMessage` lobby/lockstep union + `Command`/`CommandEnvelope` + `encode/decode`),
  `src/net/transport.ts` (`RelayTransport implements Transport`, browser `WebSocket`, promise-based
  connect resolving on `welcome`), `server/relay.ts` (room-keyed broadcast hub, addressed + broadcast
  forward, presence, room GC). Added `ws@^8.18` devDep + `relay` npm script (esbuild
  `--packages=external`, mirrors `sim`) + `.gitignore server/*.mjs`. Verified: `npm run build` clean
  (relay outside `src` → not type-checked, not in `dist` → deploy-safe); relay bundles to 2.1 kb +
  listens; a 3-client live smoke (A/B same room, C isolated) PASSed welcome/join/broadcast/addressed/
  isolation/leave. Decisions D1–D3 locked (2p / WS relay / minimal seams).
- **2026-06-17 — Architecture audit + plan.** 5-way parallel non-invasive audit + architect
  synthesis (Workflow `wf_57ca6296-897`). Determinism re-verified independently. Recommended
  deterministic delay-lockstep + `ws` relay + host-snapshot init + hash desync check; v1 = 2-player
  human-vs-human. Three decisions put to the user. This file created.
