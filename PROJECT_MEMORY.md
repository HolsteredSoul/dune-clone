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
  smart unit AI/stances/commands, **armor/damage-type rock-paper-scissors combat, anti-air
  discipline, an expanded unit roster (Rocket/Scout/Artillery), Tech upgrades, a procedural
  audio layer, and combat juice (damage numbers / hit-flash / infantry death poof)**, all on a
  re-verified difficulty ladder.
  Latest `npm run sim` (30-40 runs/cell, after the smart-harvester rebalance): **Easy ~100/100/100,
  Normal ~60/46/40, Hard ~75/52/22** (M1/M2/M3 player win%, averaged over 2 noisy confirmation
  runs) — a clean difficulty *ramp* (M1 easiest → M3 the hard finale), no 0%/100% cells, passive
  loses 100%. The sim bot is a LOWER BOUND, especially on M3, since it never micros Artillery
  (which the M3 brief advises) — a human does better. The surface is noisy; read at ≥30 runs.
- **Last done (newest):** **M14 — Combat juice (cosmetic, zero balance impact).** Three additions,
  all renderer-side: (1) **floating damage numbers** — `world.damage()` pushes a `{x,y,amount,ttl,
  friendly}` to a new `world.popups[]` (guarded by `IN_BROWSER` so the headless sim never allocates
  them); `renderer.drawPopups` floats them up + fades, fog-gated + off-screen-culled, colored
  warning-red for player hits / bright-gold for enemy hits. (2) **Hit-flash** — a `hitFlash` expiry
  *timestamp* on `Unit`+`Building` set in `damage()`; the renderer overlays a fading white tint
  (reads `world.time`, so NO per-entity decrement loop). (3) **Infantry death poof** — `Effect`
  gained a `kind:'blast'|'poof'`; infantry now poof into grey dust (size 13, bypasses the explosion
  sheet) while vehicles/aircraft/buildings keep the fiery blast (size 18/36). Constants
  `HIT_FLASH_TIME/POPUP_TTL/POPUP_RISE`. Renamed world's `AUDIO_CAPTURE` → `IN_BROWSER` (now shared
  by audio + popups). **Cannot move the sim** (popups guarded; hitFlash/effect-size/kind are never
  read by sim logic). Verified: clean `build`; **30-run sim** clean ramp + passive 100% loss
  (Easy 87/100/100, Normal 57/43/37, Hard 83/40/10 — Hard-M3 is the documented hyper-sensitive cell,
  pure noise); live E2E via `window.game` — popups populate with correct amounts + `friendly` flags,
  `hitFlash` set on hit, enemy infantry death → `poof`/size 13 + building death → `blast`/size 36 +
  `explosion-big`, render path ran 440× with **no console errors**. **Committed + pushed to
  origin/main.**
- **Prior:** **M13 — Audio layer (procedural Web Audio, zero asset files).** New
  `src/core/audio.ts` `audio` singleton: lazy `AudioContext` (unlocked on first user gesture →
  autoplay policy), master gain + compressor, per-cue throttle + 16-voice cap, optional stereo
  pan, and **mute persisted to `localStorage`** (`M` key or a clickable top-bar speaker glyph).
  ~17 cues are SYNTHESIZED at runtime (oscillators + filtered noise) — `select/move/place/
  build-start/build-ready/unit-ready/cancel/upgrade`, `fire-{gun,cannon,rocket,shell}`,
  `explosion/explosion-big/under-attack/victory/defeat` — mirroring the renderer's procedural-FX
  ethos (no files to ship, GitHub Pages stays a pure static bundle). **Wiring keeps the sim pure:**
  `world.ts` pushes plain `{name,x,y}` to a new `audioEvents` queue via `emit()`, guarded by
  `AUDIO_CAPTURE = typeof window !== 'undefined'` so the **headless sim never accumulates or imports
  audio** (zero balance/overhead — proven). `game.ts` drains the queue each `frame()`, camera-gating
  `fire-*`/`explosion*` to on-screen shots + panning by screen-x; UI cues (select/move/place/build/
  cancel/upgrade) fire directly in the input handlers; victory/defeat stinger on the win/lose edge.
  `ui.ts` got the speaker toggle (`hitTestTopBar` + `{type:'mute'}` + a `muted` draw param). Verified:
  clean `build` (+0.12 kB); **30-run sim ladder = clean ramp, unchanged by construction** (Easy
  97/100/100, Normal 57/50/30, Hard 87/60/53, passive 100% loss — M3 spread is the documented noise
  band); live E2E via `window.game`/`window.audio` — AudioContext unlocks (running@48kHz), the full
  `world.emit → game drain → audio.play` pipe fires real `fire-gun/fire-rocket/explosion/under-attack`
  with stereo pan + queue drains to 0/frame (no leak), all UI cues fire, `M`+button mute toggles and
  persists, victory/defeat stingers fire, **no console errors**. (Screenshot timed out = the known
  collapsed-tab/rAF artifact, not a bug.) **Committed + pushed to origin/main.**
- **Prior:** **Label tags + smarter harvesters + explosion advice (+ a big rebalance).**
  (1) **Building name tags** — `drawBuilding` draws a small faction-tinted name pill above each
  visible building (off the sprite art; replaced the old in-sprite text). (2) **Smarter harvesters**
  — when a tile runs dry they keep mining spice within a `HARVEST_LEASH` (4 tiles ≈ sight) and only
  return/seek a new patch when nothing's close; return immediately when full. This is a ~50% income
  gain that DE-TUNED the verified ladder; user chose to keep it + rebalance. Rebalance landing:
  `SPICE_PER_CREDIT 1 → 1.25` (the key lever — it trades eco-mission difficulty against M3 INVERSELY)
  + lifted the two hard missions (M2 player 3250→3600/enemy→1750, M3 player 3300→3750). (3) After a
  building explodes only **bare Rock tiles** remain (footprint was rocked at build time, never
  reverts) — recommended a fading scorch decal (not built). Verified: clean `build`; 30/40-run sim
  ladder above; label tags render live; harvester behavior confirmed via the sim economy shift. **Committed + pushed to origin/main** —
  this commit lands the full uncommitted backlog (M8 combat-depth → M12).
- **Prior:** **Destruction/explosion FX (renderer-only, no sim change).** Buildings
  used to vanish instantly under one fading orange circle. Now `drawEffect` (renderer.ts) plays an
  **explosion sprite-sheet** when present and otherwise draws a much richer **procedural blast**
  (expanding shockwave ring + bright white-hot flash + fireball core that cools bright→dark +
  debris specks flung outward for building-sized blasts). Sheets are auto-discovered the same way
  as buildings: drop a horizontal strip of SQUARE frames at `assets/sprites/fx-explosion.png`
  (optional `fx-explosion-large.png`, preferred for buildings) and the engine infers
  `frameCount = width/height`, `frameSize = height`, playing across the effect's ~1.2s life, scaled
  by size. No `Effect`/sim change — purely cosmetic, zero balance impact. Spec written:
  `assets/sprites/fx-explosion.md` + a new "Effects sheets" section in `SPRITE_GUIDE.md` (docs
  agent). Verified: clean `build`; live E2E — procedural blast renders (before/after pixel-diff:
  3412 px changed, debris confirmed); sprite-sheet playback proven with a synthetic 8-frame test
  strip (frame index advanced exactly with effect life: p .05/.40/.70/.95 → frame 0/3/5/7), then
  the test sheet was deleted. Units still draw procedurally. (committed 2026-06-14).
- **Prior (M10):** **Building sprites wired into the renderer.** The user generated all 8
  building PNGs from the M9 specs (ChatGPT) and dropped them in `assets/sprites/` (matching
  `SPRITE_GUIDE.md`). `renderer.ts` now auto-discovers them via
  `import.meta.glob('../../assets/sprites/building-*.png', {query:'?url'})` → a `buildingSprites`
  map; `drawBuilding` draws the sprite (`drawImage`, scaled to footprint×TILE) when loaded, else
  the procedural rectangle. All engine overlays (owner border, HP bar, turret head circle, muzzle
  flash, selection ring) still draw on top; the white name label is now suppressed when a sprite is
  present (review-agent NIT). Added `src/vite-env.d.ts` for `import.meta.glob` typing. Convention:
  drop `building-<id>.png` (top-down, footprint×TILE, transparent) in `assets/sprites/` — zero code
  change. Verified: clean `build` (8 PNGs bundled to `dist/assets/`); live runtime E2E — all 8
  sprites fetched+decoded, and per-building center-pixel sampling proved the canvas paints the
  *sprite* (e.g. Power center `#bfb28a`, not the procedural `#2f4d39`); no console errors. Ran a
  read-only review agent over the integration (all OK; acted on the name-label nit). *Note: finals
  are 1× (footprint×TILE); on a 2× DPR display they upscale nearest-neighbour — acceptable for the
  pixel style, regenerate at 2× if pixel-perfect HiDPI is wanted. Screenshot capture still times out
  = the backgrounded-rAF/2px-canvas preview artifact; pixel sampling is the reliable check here.*
  (committed 2026-06-14).
- **Prior (M9):** **Build-queue UX + parallel production + sprite specs** (multi-agent:
  1 implementer for the code, 1 doc-writer for the specs; I reviewed + integrated + verified).
  (1) **Cancel builds:** right-click a sidebar icon cancels one (full refund) — unit (`cancelUnit`,
  peels the queue from the back), structure (`cancelStructure`, clears in-progress or ready);
  left-click still adds. (2) **Multiple producers now help:** N same-type producers (Barracks/War
  Factory) build the first N queued items *concurrently* (`updateProduction` parallel-slot loop;
  `completeUnit` takes the chosen producer and each unit exits + rallies from its own building).
  (3) **Building sprite specs** under `assets/sprites/` (`SPRITE_GUIDE.md` + 8 `building-*.md` +
  `units-sprites-note.md`) — top-down, exact px from footprint×TILE, palette from defs, ready-to-
  paste image-gen prompts (the art was generated + wired in the next session, see newest). Verified: clean
  `build`; 30-run sim ladder still holds (bots use single producers, so parallel prod doesn't move
  it); live E2E (cancel refunds exactly 130/500; 2 Barracks advance 2 items in one tick). (committed 2026-06-14).
- **Prior milestone:** **Combat-depth + upgrades pass** porting the genuine deltas from the sibling
  project `C:\DEV\Dune_Grok` (Aether Command) that improve play, while deliberately skipping the
  ones that would worsen it (hard pop cap, credit storage cap/silos — both punishing/restrictive;
  enemy aircraft stays out per the prior balance decision). Added: armor classes + a
  `DAMAGE_VS_ARMOR` multiplier table, `canTargetAir`/anti-air targeting, `minRange` (artillery
  kites when caught close), units **Rocket Trooper / Recon Buggy / Artillery**, 4 **Upgrades**
  (Depleted Rounds / Composite Armor / Turbo Drives / Salvage Logistics) hosted at the Radar, and
  the enemy AI now *gradually* fields Rockets/Scouts and buys one upgrade. Re-tuned the difficulty
  table + per-mission economy to restore a healthy ladder. (Full detail in the session log.)
- **Next action:** Audio (item 1) + Combat juice (item 2) are **done**. Next up the **▼ Development
  plan** is **item 3 — Quick RTS QoL**: control groups (Ctrl+1–9, currently absent) + force a repath
  when a building is placed/destroyed on a unit's active path (today a unit can clip through a
  just-placed building for up to `repathTimer` 0.4s). All current work is committed + live.

> **Play live: https://holsteredsoul.github.io/dune-clone/** (GitHub Pages; repo is now PUBLIC).
> Auto-deploys on every push to `main` via `.github/workflows/deploy.yml`. `vite.config.ts` sets
> `base: '/dune-clone/'` for the Pages sub-path — so local dev is now `http://localhost:5173/dune-clone/`.
> Run it locally: `npm run dev` (or double-click `play.bat`) — focus the tab to play.
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
- **Combat is data-driven rock-paper-scissors (armor × damage type).** Each unit has an
  `armor` class (`light|medium|heavy|air`; buildings are `building`); each weapon has a `type`
  (`gun|cannon|rocket|shell`). Dealt damage = base × owner damage-upgrade × `DAMAGE_VS_ARMOR
  [type][armor]` (table in `defs.ts`). Buildings sit at ~1.0 for every type so base-razing pace
  is decoupled from unit tuning. Adding a counter = editing one table cell. Air is gated by a
  separate `weapon.canTargetAir` flag (the multiplier says *how well*, the flag says *whether*),
  so only Rocket Troopers / turrets / interceptor-type weapons engage flyers. `weapon.minRange`
  makes Artillery kite away when caught point-blank (its built-in weakness). *Ported/adapted from
  Dune_Grok's `DAMAGE_VS_ARMOR`, but keyed by weapon type rather than attacker unit-id so it
  doesn't couple to the roster.*
- **Audio is procedural + sim-decoupled.** Cues are SYNTHESIZED at runtime in `src/core/audio.ts`
  (Web Audio oscillators + filtered noise) — no asset files, matching the renderer's procedural-FX
  fallbacks and keeping Pages a static bundle. The sim stays pure: `world.ts` only pushes plain
  `{name,x,y}` to `audioEvents` (guarded by `typeof window`, so the headless harness is inert and
  never imports audio); the controller (`game.ts`) drains that queue each rendered `frame()`,
  applies the audio *policy* (camera-gate spatial cues to on-screen + stereo-pan, throttle, voice
  cap) and plays UI cues directly in its input handlers. This is the same "plain data + poll each
  frame, no event bus" pattern the rest of the codebase uses. The `audio` singleton is mute-by-
  `localStorage` and unlocks its `AudioContext` on the first user gesture (browser autoplay policy).
  **Combat juice (M14) reuses the exact same discipline:** floating damage numbers go into
  `world.popups[]` guarded by the shared `IN_BROWSER` flag (cosmetic, high-frequency → never built
  in the headless sim); hit-flash is an expiry *timestamp* the renderer reads against `world.time`
  (no decrement plumbing); the infantry-vs-vehicle death distinction is just an `Effect.kind` tag
  the renderer branches on. None of it is read by sim logic, so balance is untouched by construction.
- **Upgrades are owner-wide multipliers, not per-unit tech.** `Player.upgrades: Set<id>` →
  `upgradeMult(effect)`; damage & harvest multipliers apply at use-time (instant, all units),
  while vehicle HP/speed are baked per-unit in `applyUpgradeStats()` (always derived from the
  base def × current mult, so re-applying on purchase never compounds). Hosted at the Radar
  (`unlocksUpgrades`) to avoid adding a new building + prereq chain to the campaigns.

## Build methodology — agent & orchestrator direction (how this project is built)
Operate as a **lead orchestrator**: per task run *assess complexity → plan → execute (direct or
via agents) → verify → integrate → update memory*. Decide direct-vs-delegate by **coupling + file
overlap**, not just size:
- **Tightly-coupled changes on SHARED files → ONE careful hand (the orchestrator), in dependency
  order.** Combat depth touched `defs → world → ui → ai → sim` at once; parallel agents would
  collide. **Balance tuning is inherently SEQUENTIAL and chaotic** (tune → `sim` → observe →
  re-tune) — it can't be parallelized and a multi-agent Workflow does NOT help; do it single-hand
  with the sim as oracle.
- **Independent / disjoint-file work → parallel agents.** Worked well this project: a code agent
  on `src/*` + a docs agent on `assets/*.md` in parallel; a background docs agent for the
  explosion-FX spec while I coded the renderer; a read-only **review agent** running alongside my
  own live verification. Earlier multi-agent fan-outs: rally points and the balance/difficulty pass.
- **Small surgical edits in code you know → just do them** (agent overhead + re-review isn't worth it).
- Give agents **precise, self-contained specs** (they re-learn the codebase): exact method
  signatures/algorithms for delicate code so they implement *your* intent. Tell each agent which
  files are off-limits (e.g. don't touch `PROJECT_MEMORY.md`).
- **Never trust an agent's self-report — re-verify its output yourself.** The artillery-bot change
  "passed" its agent but actually *hurt* balance; only the orchestrator's own `sim` run caught it.

**Verification discipline (gate every "done"):** `npm run build` clean (tsc+vite); `npm run sim`
**≥30 runs** for any economy/combat/AI/mission change (noisy surface — see Known Issues); live
in-browser E2E via **`window.game` eval + canvas pixel-sampling** (NOT screenshots — the in-harness
preview tab is backgrounded so rAF pauses, the canvas collapses to ~2px and screenshots time out;
resize to 1280×800 inside the eval to sample real pixels). Use `spawn_task`/background agents for
out-of-scope follow-ups. Update this file at session end (Status pointer + roadmap + Known Issues +
session log, newest on top).

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
- [x] **M8 — Combat depth & upgrades** (inspired by `C:\DEV\Dune_Grok`). Armor/damage-type
  multiplier table, anti-air targeting discipline (`canTargetAir`), Artillery `minRange`+kite,
  new units (Rocket Trooper / Recon Buggy / Artillery), 4 Tech upgrades at the Radar, enemy AI
  gradually fields Rockets/Scouts + buys an upgrade. Difficulty table + per-mission economy
  re-tuned; ladder re-verified via `npm run sim`. ✅
- [x] **M9 — Build-queue UX + parallel production + sprite specs.** Right-click-to-cancel
  builds (refund), N same-type producers build N items concurrently, and `assets/sprites/*.md`
  generation specs for building art (specs only; renderer still draws procedural placeholders). ✅
- [x] **M10 — Building sprite rendering.** All 8 building PNGs (generated from the M9 specs) live
  in `assets/sprites/`; `renderer.ts` auto-discovers them via `import.meta.glob` and `drawBuilding`
  blits the sprite (procedural-rect fallback for any missing). Units still draw procedurally. ✅
- [x] **M11 — Destruction/explosion FX.** `drawEffect` plays an `fx-explosion*.png` square-frame
  strip (auto-discovered, `frameCount=width/height`) when present, else a richer procedural blast
  (ring + flash + cooling fireball + debris). Spec: `assets/sprites/fx-explosion.md`. Renderer-only,
  no sim change. ✅
- [x] **M13 — Audio layer.** Procedural Web Audio synth (`src/core/audio.ts`, zero asset files):
  ~17 cues (select/move/place/build/cancel/upgrade, per-weapon-type fire, explosion, under-attack,
  victory/defeat) with throttle + voice cap + stereo pan + `localStorage` mute (`M`/top-bar speaker).
  Sim stays pure via a `world.audioEvents` queue drained in `game.frame()`; zero balance impact. ✅
- [x] **M14 — Combat juice.** Cosmetic-only: floating damage numbers (`world.popups[]`, `IN_BROWSER`-
  guarded), hit-flash (white tint via a `hitFlash` timestamp on units/buildings), and an infantry
  death "poof" (grey dust, vs the fiery blast vehicles/buildings get) via `Effect.kind`. Renderer +
  a few `world.damage()` lines; zero balance impact. ✅

## Open tasks / current priorities

### ▼ Development plan (next session) — code-accurate, re-prioritized 2026-06-14
Distilled from a reviewed plan; corrected against the actual codebase (an external plan assumed
much of the "core" was broken — most of it isn't). The game is feature-complete and *playable
well*; the next work is the immersion/feel layer and depth, not "hardening."

**⚠ ALREADY BUILT — do NOT re-implement (a prior plan wrongly listed these as missing):**
unit separation/anti-clumping (`world.ts` `separate()`); fog-of-war hiding enemies (`fog.ts` +
renderer `visibleEntity()` + minimap); red/green invalid-placement ghost (`canPlace`); clickable
minimap with owner-colored unit dots + fog overlay; sidebar build-progress bars + `xN` queue
counts; unit/building HP bars; selection rings; "LOW POWER" banner; rally dashed-line+flag visual;
right-click-cancel builds; parallel production; building sprites; **explosion FX (sprite-sheets live)**.

**Do next, in order (each ~a session; balance-bound items are the wildcard):**
1. ~~**Audio layer**~~ ✅ **DONE (M13).** Procedural Web Audio (`src/core/audio.ts`): per-weapon
   fire, select/move/build/under-attack/explosion/victory cues, mute (`M`/speaker), zero balance
   impact. The next-time extension if wanted: optional sample-file overrides (drop wav/mp3, prefer
   over synth) — but keep them OUT of the `world.ts` import chain so the esbuild sim stays clean.
2. ~~**Combat juice**~~ ✅ **DONE (M14).** Floating damage numbers + hit-flash + infantry death
   poof, all renderer-side, zero balance impact. (Note: units *did* already spawn a death blast via
   the M11 FX — M14 added the poof differentiation + numbers + flash. Recoil was skipped as
   redundant with the flash.)
3. **← NEXT: Quick RTS QoL** — control groups (Ctrl+1–9, *currently absent*) + the one real Phase-0 fix:
   force a repath when a building is placed/destroyed on a unit's active path (today a unit can
   clip through a just-placed building for up to `repathTimer` 0.4s — cosmetic, minor).
4. **Smarter sim bot, THEN AI personalities** — the sim bot is a naive proxy (can't micro
   Artillery → under-states the hard missions), which makes balance untrustworthy. Improve it
   first, *then* add AI archetypes (Turtle/Rusher/Mechanized/Economist) to cut predictability.
   **Balance-bound: re-run `npm run sim` and expect noisy multi-pass tuning.**
5. **Objective / win-condition types** (defend / survive-timer / destroy-target), THEN expand the
   campaign to 5–6 missions. Variety needs the *system* first — today victory is only
   "last building standing", so more lookalike missions won't feel varied. **Balance-bound.**

**Strategic (bigger, elevate above the old "Phase 3"):**
- **Faction asymmetry (Atreides vs Harkonnen)** — the real "Dune" identity; today it's generic
  green-vs-red with identical rosters. Big lift, high payoff. Flagship goal.
- **Save/load** — high QoL for a campaign and comparatively easy (sim is deterministic →
  snapshot state). Pull up from "longer-term."

**Then (roughly as the source plan had them):** skirmish mode, repair mechanics, a rocket/AA
turret (cheap — data-only in `defs.ts`), unit veterancy, perf (spatial partitioning) only when it
hurts, multiplayer last.

**Process reminders:** validate economy/combat/AI/mission changes with `npm run sim` (≥30 runs;
the surface is noisy — see Known Issues); keep using multi-agent sessions for big features; the
external plan's week-estimates are ~2–4× high for this AI-assisted workflow *except* balance work,
which is the unpredictable wildcard.

## Known issues / risks
- **Pathfinding** (M5) is the hardest piece; grid A* with many units can get expensive — defer
  until needed, then budget for it.
- **Performance with many units/projectiles** — Canvas 2D is fine for hundreds of sprites but
  watch per-frame allocations; keep the hot loop allocation-free.
- **Scope creep** — this genre is huge. Build strictly module-by-module; no feature lands
  unless it serves the current milestone's "done when."
- **Balance ladder is sim-bot-measured, and the bot is naive.** The `scripts/sim.ts` PlayerBot
  builds harvesters/infantry/Rocket Troopers/tanks and buys upgrades, but does **not** use
  Artillery (which hard-counters M3's turret line), Scouts, aircraft, or any micro/focus-fire.
  Real human win-rates therefore sit *above* the sim numbers. Treat the sim ladder as a lower
  bound, not a target to hit exactly.
- **M3 is hyper-sensitive to its pre-placed enemy army.** During the M8 tuning a single extra
  enemy tank swung M3 win% by ~40pp and an extra turret by ~80pp. Tune M3 with the smallest
  increments (credits, then one unit) and always re-read at **30 runs** — 12/20-run reads are
  noisy enough to show Hard>Normal inversions.
- **Artillery is player-only; the enemy AI doesn't field it.** Its `minRange` kite needs the
  unit to back off under fire, which the simple AI/sim bots don't drive well. If the AI is given
  Artillery later, verify it doesn't feed itself point-blank.
- **Balance tuning is a CHAOTIC, noisy surface — hand-tuning fights back.** Hard-won lessons from
  the smart-harvester rebalance (don't repeat the flailing):
  • The bot-vs-bot ladder is noisy; only trust ≥30-run reads, and even 30 vs 40 runs disagree by
    ±20pp on swingy cells (esp. M3). • `SPICE_PER_CREDIT` is the highest-leverage knob: it trades
    eco-mission difficulty against M3 difficulty INVERSELY (low yield → eco hard / M3 easy; high
    yield → eco easy / M3 hard), so it sets the overall economy tempo; per-mission credits then
    fine-tune individual missions. • Enemy **aggression has an inverted, mission-specific effect**:
    raising it often makes a mission EASIER for the player because the AI over-commits onto the
    player's turret/tank defense and dies — do NOT treat aggression as a simple difficulty dial.
    • Giving the **sim PlayerBot Artillery made it WORSE** (it a-moves the fragile arty forward and
    loses it — no positioning micro), so the bot's best/most-representative composition is
    tanks + Rocket Troopers + upgrades; keep it that way. • The bot under-states M3 (can't siege
    with Artillery), so M3's true human difficulty is lower than the bot win%.

- **Building sprites under 4 KB are INLINED by Vite, not emitted to `dist/assets/`.** Vite's
  default `assetsInlineLimit` (4096 B) base64-inlines small assets into the JS bundle. So
  `dist/assets/` only shows the 4 sprites over 4 KB (helipad/radar/refinery/yard) — barracks/
  factory/power/turret are embedded in `index.js` and render fine. NOT a bug; don't "fix" it.
  Set `assetsInlineLimit: 0` in a `vite.config.ts` only if you want every sprite as a real file.
  Separately: after moving the sprite folder / changing the `import.meta.glob` path, a long-running
  dev server can hold stale asset URLs — restart `npm run dev` + hard-reload (Ctrl+Shift+R).

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
- **2026-06-14** — **M14: Combat juice (cosmetic).** Item 2 of the dev plan. All renderer-side,
  reusing the audio session's sim-purity discipline. (1) **Floating damage numbers**: `world.damage()`
  pushes `{x,y,amount,ttl,friendly}` to a new `world.popups[]` (guarded by `IN_BROWSER` — renamed
  from `AUDIO_CAPTURE`, now shared — so the headless sim never allocates the high-frequency popups);
  aged by a new `updatePopups()`; `renderer.drawPopups()` floats them up `POPUP_RISE` px + fades in
  the last 35%, fog-gated + off-screen-culled, warning-red for player hits / bright-gold for enemy
  hits. (2) **Hit-flash**: a `hitFlash` *expiry timestamp* on `Unit`+`Building` set in `damage()`;
  `drawUnit`/`drawBuilding` overlay a fading white tint computed from `world.time` (no decrement
  loop needed, unlike `muzzleFlash`). (3) **Infantry death poof**: `Effect` gained `kind:'blast'|
  'poof'`; `damage()` tags infantry deaths `poof` (size 13) and everything else `blast` (vehicle/air
  18, building 36); `drawEffect` draws a soft grey dust cloud for `poof` (returns before the
  explosion-sheet path) so infantry no longer use the fiery vehicle blast. New constants
  `HIT_FLASH_TIME 0.12 / POPUP_TTL 0.7 / POPUP_RISE 20`; new `top()` geometry helper. **Zero balance
  impact by construction** — popups are browser-guarded, and hitFlash/effect-kind/effect-size are
  never read by any sim system. Verified: clean `build` (+1.7 kB); **30-run sim** = clean ramp +
  passive 100% loss (Easy 87/100/100, Normal 57/43/37, Hard 83/40/10; Hard-M3 is the documented
  hyper-sensitive/noisy cell, not a regression — sim is byte-equivalent); live E2E via `window.game`
  (forced on-screen combat: `world.popups` populated with correct `amount`+`friendly`; `hitFlash`
  set on hit for both units + buildings; enemy infantry death → `Effect{kind:'poof',size:13}`,
  building death → `{kind:'blast',size:36}` + `explosion-big` cue; render path exercised 440× with
  **no console errors**). Files: `world/{world,unit,building,constants}.ts`, `render/renderer.ts`.
  (committed + pushed 2026-06-14).
- **2026-06-14** — **M13: Audio layer (procedural Web Audio).** Top item of the dev plan. New
  `src/core/audio.ts` `audio` singleton synthesizes ~17 cues at runtime (oscillator tones + filtered
  noise; `tone()`/`noise()` primitives) — no sound files, mirroring the renderer's procedural blasts.
  Lazy `AudioContext` unlocked on first gesture (autoplay policy: belt-and-suspenders — both an
  in-`handleInput` call AND direct `pointerdown`/`keydown` listeners in `main.ts`); master gain →
  compressor; per-cue THROTTLE map + 16-voice cap (a battle collapses to a cadence, not a wall);
  optional stereo pan; mute persisted to `localStorage` (`M` key + a procedural top-bar speaker glyph
  with a red strike when muted). **Architecture (the important bit): the sim stays pure.** `world.ts`
  pushes plain `{name,x,y}` to a new `audioEvents` queue through `emit()`, gated by
  `AUDIO_CAPTURE = typeof window !== 'undefined'` — so the headless esbuild sim (which imports
  world.ts) never accumulates events, never imports audio, and is byte-for-byte unchanged. Hook sites
  (from a 3-agent code-map workflow): `fire()`→`fire-<weapon.type>`, `damage()`→`explosion`/`-big` on
  death + throttled `under-attack` on player hit, `completeUnit()`→`unit-ready`, structure-ready→
  `build-ready`. `game.frame()` drains the queue: spatial cues (`fire-*`/`explosion*`) are
  camera-gated to on-screen + panned by screen-x, the rest always play; select/move/place/build/
  cancel/upgrade fire directly in the input handlers; victory/defeat stinger on the win/lose edge.
  `ui.ts` added the speaker toggle (`hitTestTopBar` + `{type:'mute'}` UiAction + a `muted` draw param).
  `main.ts` exposes `window.audio` (debug handle, like `window.game`). **Verified:** clean `build`
  (+0.12 kB); **30-run sim** = clean ramp (Easy 97/100/100, Normal 57/50/30, Hard 87/60/53, passive
  100% loss; M3 spread is the documented noise band — and audio CANNOT move the sim by construction);
  exhaustive live E2E via `window.game`/`window.audio` (AudioContext running@48kHz; full
  `emit→drain→play` pipe proven with real `fire-gun/fire-rocket/explosion/under-attack` + non-zero
  pan + queue drains to 0/frame; all 6 UI cues; `M`+button mute toggle + `localStorage` persist;
  victory/defeat stingers; zero console errors). Screenshot timed out = known collapsed-tab artifact.
  Files: new `src/core/audio.ts`; `src/world/world.ts`, `src/game/game.ts`, `src/render/ui.ts`,
  `src/main.ts`; docs `CLAUDE.md` + this file. (committed + pushed 2026-06-14).
- **2026-06-14** — **Shipped public + captured next-session plan.** Made the repo PUBLIC and put
  the game live on GitHub Pages (`vite.config.ts` base `/dune-clone/` + `.github/workflows/deploy.yml`,
  Pages source = Actions): **https://holsteredsoul.github.io/dune-clone/**, auto-deploys on push to
  `main` (verified live, 200). Reviewed an external dev plan, reality-checked it against the code
  (it wrongly assumed separation/fog/invalid-ghost/minimap/queue-bars/HP-bars/low-power were
  missing — all already built), and wrote the corrected, re-prioritized roadmap into "Open tasks /
  current priorities" above (audio → combat juice → control groups → smarter sim bot + AI
  personalities → objective types; faction asymmetry + save/load elevated). Key reframing: the
  foundation is solid, so skip "hardening" and go straight to the immersion/feel layer; every
  economy/combat/AI/mission change carries a noisy sim-rebalance tax.
- **2026-06-14** — **M12: label tags + smart harvesters + big rebalance.** Three asks: (1) building
  label tags, (2) harvesters prioritise returning when full + fill within a visual leash else return
  & find a new patch, (3) advise what's left after a building explodes. Did (1) — name pill above
  each building in `renderer.ts` (faction-tinted, off-sprite; removed the old in-sprite name). Did
  (3) — answered: only bare Rock tiles remain (footprint rocked at build time, never reverts);
  recommended a fading scorch decal (not built). Did (2) — `HARVEST_LEASH` (4 tiles) in the `mining`
  phase: full → return immediately; tile dry & not full → continue to nearest spice within the leash,
  else bank load / seek new patch. **This +~50% income DE-TUNED the verified ladder** (eco-missions
  trivial, M3 brutal). User chose KEEP IT + full rebalance. The rebalance ate ~12 sim passes and
  taught the chaos lessons now in Known-Issues. Things tried & rejected: per-mission credit tuning
  (didn't fix M3 — structural, not economic); reverting income via `SPICE_PER_CREDIT=1.5`
  (over-corrected — eco too hard); aggression tuning (inverted/chaotic effect); giving the PlayerBot
  Artillery (made it WORSE — blobs fragile arty, no micro → reverted). What WORKED: `SPICE_PER_CREDIT
  1 → 1.25` (the inverse eco↔M3 lever, sets economy tempo near baseline) + lifting the two hard
  missions (M2 player 3250→3600 / enemy 1800→1750; M3 player 3300→3750). Final ladder (noisy, 30-40
  runs): Easy ~100, Normal ~60/46/40, Hard ~75/52/22 — a clean ramp, no broken cells, passive loses
  100%. Files: `render/renderer.ts`, `world/{constants,world}.ts`, `game/missions.ts`, `scripts/sim.ts`.
  (committed 2026-06-14).
- **2026-06-14** — **M11: destruction/explosion FX.** User noted buildings blowing up was a missed
  opportunity for animation sheets. Reworked `drawEffect` (renderer-only — `Effect` and the
  `world.damage()` death-spawn are unchanged, so zero sim/balance impact): if an explosion sheet is
  loaded it plays the frame strip across the effect's ~1.2s life scaled by size, else a richer
  procedural blast draws (expanding shockwave ring + white-hot flash + fireball core cooling
  bright→dark + outward debris specks for building-size blasts, with deterministic position-seeded
  offsets — no per-frame alloc). FX sheets auto-discovered like buildings via a second
  `import.meta.glob('../../assets/sprites/fx-*.png')`; convention = horizontal strip of SQUARE
  frames, engine infers `frameCount=width/height`/`frameSize=height`. `fx-explosion.png` for all
  blasts (scaled), optional `fx-explosion-large.png` preferred for buildings. Spec authored by a
  background docs agent: `assets/sprites/fx-explosion.md` + a new "Effects sheets" section in
  `SPRITE_GUIDE.md`. Verified: clean `build`; live E2E — procedural blast renders (before/after
  pixel-diff = 3412 changed px, debris present); sprite-sheet playback proven with a synthetic
  8-frame opaque test strip (center-pixel R tracked the frame exactly at p .05/.40/.70/.95 → frame
  0/3/5/7), then the test strip was deleted so it can't shadow real art. Units still procedural
  (future pass). Files: `renderer.ts`, new `assets/sprites/fx-explosion.md`, `SPRITE_GUIDE.md`. (committed 2026-06-14).
- **2026-06-14** — **M10: building sprite rendering wired in.** User generated all 8 building PNGs
  from the M9 specs via ChatGPT and placed them in `assets/sprites/` (the location `SPRITE_GUIDE.md`
  prescribes). I validated each (Python/PIL): correct footprint×TILE size, transparent corners,
  RGBA, top-down, faction-neutral, on-palette — all 8 pass. Wired rendering: `src/render/renderer.ts`
  module-level `import.meta.glob('../../assets/sprites/building-*.png', {eager,query:'?url'})` builds
  a `buildingSprites` map; `drawBuilding` blits `drawImage(sprite, sx, sy, w, h)` when
  `sprite.complete && naturalWidth>0`, else the procedural color/trim rects. Suppressed the white
  name label when a sprite is present (it self-identifies). Added `src/vite-env.d.ts`
  (`/// <reference types="vite/client" />`) so `tsc` knows `import.meta.glob`. Cleaned up: an earlier
  detour put runtime PNGs in `src/sprites/` — removed that folder and aligned the glob to
  `assets/sprites/` (where the spec + user put them); deleted the 4× `*-author-*` staging temps.
  Used a read-only review agent on the integration (no bugs; its name-label nit was the one change I
  took; DPR/HiDPI note logged). Verified: clean `build` (8 PNGs → `dist/assets/`); live runtime E2E
  on a resized 1280×800 viewport — all 8 sprites fetched+decoded (`allLoadedOk`), and center-pixel
  sampling of every player building proved the canvas shows the *sprite* not the fallback (Power
  `#bfb28a` vs procedural `#2f4d39`); no console errors. Convention for the future: drop
  `building-<id>.png` in `assets/sprites/`, no code change. Files: `renderer.ts`, new
  `src/vite-env.d.ts`, `assets/sprites/building-*.png` ×8. (committed 2026-06-14).
- **2026-06-14** — **M9: build-queue UX + parallel production + building sprite specs.** Run as a
  small multi-agent job (1 code implementer for features 1+2 — tightly coupled, shared files; 1
  doc-writer for the sprite specs — independent), then I reviewed + integrated + verified. (1)
  **Cancel builds:** sidebar right-click cancels one with a full refund — `world.cancelUnit`
  (removes the last matching queue item from the back so the near-done front items keep building)
  and `world.cancelStructure` (clears `p.ready` or the in-progress `p.building`); `game.ts`
  `onRightDown` now hit-tests the sidebar → `doUiCancel`; left-click still adds. (2) **Multiple
  producers finally matter (decision: parallel throughput, not a speed bonus):** `updateProduction`
  now advances the first `min(producerCount, queueLen)` items concurrently and completes them
  (handles out-of-order finishes via an `i--; slots--` window), distributing spawns round-robin;
  `completeUnit(faction, defId, producer: Building)` so each unit exits at and rallies from the
  building that made it. Keeps the single shared per-type queue + sidebar unchanged. (3) **Sprite
  specs** in `assets/sprites/`: `SPRITE_GUIDE.md` (top-down orthographic, px = footprint×TILE,
  PNG@4× supersample, palette from defs, engine-overlay exclusions, horizontal-strip sheet layout)
  + `building-<id>.md` ×8 (each with exact px, palette, aerial description, and a ready-to-paste
  image-gen prompt) + `units-sprites-note.md`. Turret spec correctly tells the artist to leave the
  centre clear because the engine draws its own `#2a2a30` head circle. **Specs only — no art wired
  into the renderer yet.** Verified: `build` clean; 30-run sim ladder unchanged (Easy ~83–100,
  Normal 50–60, Hard 30–67, passive 100% loss — parallel prod doesn't move it since the bots build
  single producers); live E2E via `window.game` (cancel refunded exactly 130 cr for a Rocket / 500
  for a Radar; with 2 Barracks both front queue items advanced equally in one tick while the 3rd
  stayed at 0). Files: `world.ts`, `game.ts`, new `assets/sprites/*.md`. (committed 2026-06-14).
- **2026-06-14** — **Combat-depth + upgrades pass (M8), inspired by `C:\DEV\Dune_Grok`.** Goal:
  port the genuine improvements Aether Command had that Dune_Clone lacked, skipping anything that
  would make play worse. Compared both codebases: Dune_Clone is the stronger *engine* (Grok's own
  memory shows it mined us for A*, projectiles, missions, fog, etc.); Grok's real edge was
  **combat depth + roster variety**. User picked scope = *Core + Upgrades*, enemy adopts new units
  *gradually*. Added (all data-driven): **armor classes + `DAMAGE_VS_ARMOR` table** keyed by weapon
  `type` (gun/cannon/rocket/shell × light/medium/heavy/air/building); **`canTargetAir`** discipline
  (only Rockets/turrets hit flyers — gives the Ornithopter a real counter); **`minRange`** + an
  Artillery kite; new units **Rocket Trooper** (anti-armour/AA infantry), **Recon Buggy** (fast
  light-killer/recon), **Artillery** (siege, splash, min-range); **4 upgrades** at the Radar
  (Depleted Rounds +15% dmg / Composite Armor +25% veh HP / Turbo Drives +15% veh speed / Salvage
  Logistics +25% harvest) — owner-wide multipliers, HP/speed baked per-unit without compounding.
  Enemy AI now blends Rockets (~1:2 vs rifles) + a couple of Scouts and sinks a big surplus into
  one damage upgrade; M2/M3 enemy rosters seeded with a Rocket Trooper; M1 now starts the player
  with a Barracks so Rockets are reachable early. **Deliberately skipped** (would worsen play):
  hard pop cap (restrictive, risks the AI/sim), credit storage cap + silos (punishing in a short
  campaign); **enemy aircraft stays out** (prior "don't retry" decision). Rebalanced: the new tools
  cratered the old flat ladder (Normal→17–42%, Hard→0–8%) because the sim PlayerBot wasn't using
  them and the AI got rockets+upgrades; fix = teach the PlayerBot to mix Rockets + buy upgrades
  (model a competent human), soften rocket-vs-heavy 1.5→1.4, cap the AI to one upgrade, ease the
  Normal/Hard enemy credit mults, and re-derive per-mission credits/army. **Final 30-run ladder:
  Easy 97/97/97, Normal 50/63/50, Hard 57/27/47, passive 100% loss, ~190s median, no <90s stomps**
  — a healthy ramp (Hard M2/M3 ≈ the old 27/43 targets; Normal slightly lower but a human exceeds
  the naive bot). Verified: `tsc`+`build` clean; 30-run sim; live in-browser E2E via `window.game`
  eval (built a Radar through the real pipeline, bought Composite Armor → harvester maxHp 320→**400**,
  queued+spawned a Rocket, confirmed the sidebar renders the new unit + 4 upgrade icons and that
  clicks route to `unit`/`upgrade` actions, no console errors). Screenshot timed out = the known
  backgrounded-rAF artifact, not a bug. Files touched: `defs.ts`, `player.ts`, `unit.ts`,
  `world.ts`, `ai.ts`, `missions.ts`, `render/{renderer,ui}.ts`, `game/game.ts`, `scripts/sim.ts`.
  Not yet committed.
- **2026-06-13** — Added `play.bat` Windows launcher (checks npm, installs deps on first run,
  opens browser via `vite --open`). Updated PROJECT_MEMORY. Committed + pushed to GitHub.
  Discussed AI personality archetypes (Turtle/Rusher/Mechanized/Economist) — not yet started.
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
