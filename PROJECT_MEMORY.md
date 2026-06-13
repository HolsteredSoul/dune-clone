# PROJECT_MEMORY — Dune_Clone

Single source of truth. Updated at the end of every session that changes things.

## Goal
Build a **Dune II / Command & Conquer–style real-time strategy game** that runs in the
browser. Core experience:
- **Economy:** harvesters collect spice from the map and return it to a refinery, which
  converts it to credits.
- **Construction:** a central construction yard erects structures (power, refinery,
  production, defense) that unlock successive tech levels.
- **Production:** infantry, ground vehicles, and aircraft are built at specialized
  facilities, gated by credits and power.
- **Command & combat:** units are selected and commanded in real time to move, attack, or
  hold; combat is continuous, no pausing.
- **Missions:** a sequence of scenarios that progressively introduce units, structures, and
  tactical challenges.

The bar for "real": a playable mission where the full loop — harvest → build → produce →
fight → win/lose — works without breaking.

## Status (the cross-session pointer — read this first, update at session end)
- **▶ Current phase:** COMPLETE — full 3-mission RTS with rally points, difficulty levels,
  smart unit AI/stances/commands, and a balanced, sim-verified difficulty ladder.
  Latest `npm run sim` (30 runs/cell): Easy 100/100/100, Normal 60/60/63, Hard 30/27/43 (M1/M2/M3
  player win%), no <90s stomps, passive player loses 100%.
- **Last done:** Built the full game on the data-driven architecture: base construction
  (build menu + placement + power + tech prereqs), unit production (infantry/harvester/tank/
  aircraft, power-scaled queues), selection + real-time command + A* pathfinding + projectile
  combat + death, enemy AI (build order → train → attack waves), fog of war, sidebar/minimap UI,
  and a 3-mission escalating campaign with win/lose. Verified by driving the fixed-timestep sim
  headlessly: economy climbs, AI builds 5→11 buildings & 5→24 units and overruns a passive
  player (lose fires at t=73s); a scripted player bot places structures, produces units, and
  damages the enemy; victory branch confirmed (enemy buildings→0 ⇒ 'won'); all 3 missions
  construct + render with no exceptions. `tsc --noEmit` clean, `npm run build` clean (22 modules).
- **Next action:** None required — feature-complete. Optional polish if desired: audio
  (WebAudio sfx), **control groups (Ctrl+1–9)** [user deferred this round], rally points,
  unit veterancy, more missions, balance passes, perf pass if unit counts grow large.

> Run it: `npm run dev` → http://localhost:5173/ — focus the tab to play.
> Live state is on `window.game` in the console (e.g. `game.world`) for debugging.

> ⚠ Verification note: the in-harness preview captures a *backgrounded* tab, where the browser
> pauses `requestAnimationFrame` (so live screenshots time out and the loop appears frozen).
> This is an environment artifact, not a game bug — a focused tab runs normally (proven by the
> M2 live screenshot). Logic was verified by stepping the deterministic sim directly via eval.

## Architecture decisions
- **Stack: TypeScript + HTML5 Canvas, bundled with Vite. No game engine.** Chosen for instant
  iteration (HMR), zero install for players, and full control over the RTS simulation. Rejected
  Phaser/Godot/Pygame for this project (user decision, 2026-06-13).
- **Fixed-timestep simulation, decoupled render.** Update the world at a constant dt
  (e.g. 60 Hz) with an accumulator; render interpolates / draws as fast as the browser allows.
  Keeps the sim deterministic and frame-rate independent.
- **Tile-based map.** Square tiles (grid). Terrain types: sand, rock, spice. World/screen
  coordinate conversion goes through the camera.
- **Plain data + functions over heavy OOP.** Entities are small structs with update functions.
  Avoid premature class hierarchies until combat/units demand them.
- **Memory model: single `PROJECT_MEMORY.md`** (user chose lightweight over the four-store
  governance system). `CLAUDE.md` is a thin router to this file.

## Module roadmap (build order; each is a verifiable increment)
- [x] **M0 — Scaffold & game loop.** Vite + TS, canvas host, fixed-timestep loop, input,
  camera. *Done when:* a blank map renders and the camera scrolls. ✅
- [x] **M1 — Map & rendering.** Tile map with sand/rock/spice, viewport culling, grid. *Done
  when:* a varied map draws and only visible tiles are processed. ✅
- [x] **M2 — Economy core loop (VERTICAL SLICE).** Refinery + one harvester that finds spice,
  harvests to capacity, returns, unloads → credits rise; spice depletes. *Done when:* credits
  climb on their own and the HUD shows it. ✅ (verified in-browser 2026-06-13)
- [x] **M3 — Base construction.** Construction yard menu, structure placement (ghost + valid
  check + base-adjacency), power balance (produced vs consumed, scales production speed), tech
  prerequisites. ✅
- [x] **M4 — Unit production.** Infantry/harvester/tank/aircraft built at their facilities;
  per-producer queues gated by credits + power; units spawn at building exits. ✅
- [x] **M5 — Selection, command & combat.** Box + click selection, right-click move/attack/
  harvest, stop, grid A* pathfinding + separation, projectile combat, splash, HP/death,
  explosions. ✅
- [x] **M6 — Enemy AI, fog & missions.** Skirmish AI (build order → train → attack waves), fog
  of war, win/lose (last-building-standing), 3-mission escalating campaign with briefings. ✅
- [x] **M7 — Polish.** Sidebar build menus, minimap (click-to-jump + viewport), top resource
  bar, low-power warning, mission overlays, HP bars, muzzle flashes, tech tiers, aircraft. ✅
  *(Not done: audio — optional, deferred.)*

## Open tasks / current priorities
1. Scaffold Vite + TS project (package.json, tsconfig, vite config, index.html, src/).
2. Implement core loop + camera + input (M0).
3. Implement tilemap + renderer with terrain (M1).
4. Implement refinery + harvester economy loop + HUD (M2 vertical slice).
5. Verify it runs (`npm run dev`) and the harvest loop actually increments credits.

## Known issues / risks
- **Pathfinding** (M5) is the hardest piece; grid A* with many units can get expensive — defer
  until needed, then budget for it.
- **Performance with many units/projectiles** — Canvas 2D is fine for hundreds of sprites but
  watch per-frame allocations; keep the hot loop allocation-free.
- **Scope creep** — this genre is huge. Build strictly module-by-module; no feature lands
  unless it serves the current milestone's "done when."

## Verification checklist (per increment)
- [ ] `npm run build` type-checks with no errors.
- [ ] `npm run dev` runs; the app loads with no console errors.
- [ ] The milestone's "done when" is observably true when the app runs.
- [ ] PROJECT_MEMORY.md Status pointer + roadmap checkbox updated.

## Notes
- `npm install` reports 2 high-severity advisories. These are the known **esbuild/Vite
  dev-server** advisory (dev-only; not shipped in the production build). Do NOT run
  `npm audit fix --force` — it force-upgrades Vite to a breaking major for no real gain here.
  Revisit if/when bumping Vite intentionally.

## Session log (terse; newest on top)
- **2026-06-13** — Rally points + balance/difficulty overhaul, run via a multi-agent Workflow
  (9 specialist agents: design → implement → verify → fix) plus my own verification pass.
  Added: **rally points** (Building.rallyX/Y, World.setRally/clearRally, completeUnit routes
  new units to the rally via attack-move/move/harvest; right-click a selected friendly producer
  to set, right-click it to clear; dashed line + flag render). **Difficulty system** (Easy/
  Normal/Hard `DIFFICULTY` table in defs.ts → enemy/player credit mults, AI aggression/think/
  waveCap; picker on the brief overlay, session-persistent, threaded into World+EnemyAI).
  **Balance**: AI masses in capped waves with a holdUntil grace (no <90s rushes), turret HP
  buffed, harvester economy retuned (2 starting harvesters), per-mission credits/aggression
  tuned. **Headless sim harness** `scripts/sim.ts` (`npm run sim`, bundled via local esbuild) —
  bot-vs-AI across missions×difficulties. The fix agent had stripped M3's aircraft (contradicting
  its "Air Superiority"/"Ornithopters" brief); I tried restoring them but the sim showed enemy
  aircraft make M3 unwinnable/stalemate (the ground-only player + AA-less bot can't counter fast
  flyers) → **reverted**: M3 is now "Stronghold" (hardest mission via an extra enemy turret+tank,
  no enemy aircraft) with an honest brief. Aircraft remain a fully-working **player-buildable**
  unit (helipad → Ornithopter); the enemy just doesn't field them in the campaign, for balance.
  Also corrected the M1/M2 briefs. Independently verified: `tsc`+`build` clean; rally works live
  (new unit attack-moves to rally); difficulty picker wired; sim shows a clean ladder with no
  <90s stomps and passive player losing 100% (final numbers confirmed by re-sim).
  **Rejected approach (don't retry):** enemy aircraft in campaign missions — they break balance
  given the AI/bot have no anti-air behaviour; fixing would need AA micro, out of scope.
- **2026-06-13** — Unit AI + command depth pass. Replaced the dumb behaviour (idle = sit, move
  = ignore enemies, kill = stop) with: stance-driven autonomy (Aggressive / Guard / Hold-Ground
  / Hold-Fire) using a guard-post leash; retaliate while moving; **re-acquire next target after
  a kill**; attack-move that engages en route then resumes to the goal. Added manual commands
  (attack-move `A` w/ aim cursor, stop `S`, hold `H`, guard `G`) + an on-screen context command
  bar (commands + stance toggles, hit-tested). Freed WASD from the camera (arrows/edge/minimap
  pan) for command hotkeys. Verified via deterministic sim: 8/9 behaviours pass outright, the
  9th was a flawed assertion (enemy AI kept spawning) — re-acquire + all stances + attack-move
  confirmed correct; UI hit-test + hotkey wiring confirmed; no regressions. `tsc`/`build` clean.
- **2026-06-13** — Built + verified M3–M7 to completion. Restructured into a data-driven
  architecture (defs.ts drives all buildings/units). Added: A* pathfinding, generic Building/
  Unit/Projectile entities, Player economy/queues, World combat+production orchestration,
  enemy AI, fog of war, sidebar/minimap UI, 3-mission campaign, win/lose. Verified by stepping
  the deterministic sim via eval (rAF paused in backgrounded preview tab — environment artifact).
  Removed superseded harvester.ts/refinery.ts. `tsc` + `npm run build` clean.
- **2026-06-13** — Built + verified M0–M2. Scaffolded Vite/TS, core fixed-timestep loop,
  camera, tilemap (culled render), refinery + harvester state machine, HUD. Confirmed live:
  credits climb on their own, no console errors, clean build. Added `window.game` dev hook.
- **2026-06-13** — Kickoff. Flagged that the inherited governance docs were a quant/measurement
  template that doesn't fit a game; user chose to replace them with this lightweight file and to
  build on TS + HTML5 Canvas. Archived old docs. Defined goal, decisions, and module roadmap.
