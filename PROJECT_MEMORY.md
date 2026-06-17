# PROJECT_MEMORY — Dune_Clone

Single source of truth. Updated at the end of every session that changes things.

> **Networked multiplayer** (the additive `src/net/` + `server/` layer) has its own source of
> truth: **`MULTIPLAYER_MEMORY.md`**. This file covers the single-player game; that one covers MP.

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
- **▶ Current phase:** COMPLETE — full 4-mission RTS with rally points, difficulty levels,
  smart unit AI/stances/commands, **armor/damage-type rock-paper-scissors combat, anti-air
  discipline, an expanded unit roster (Rocket/Scout/Artillery), Tech upgrades, a procedural
  audio layer, combat juice (damage numbers / hit-flash / infantry death poof), control
  groups + a clip-through repath fix, a (skirmish-ready) AI-personality system,
  objective/win-condition types (destroyAll/destroyTarget/survive/defend) with a new survive
  mission, quick save/load, a Rocket Turret, building repair, Atreides-vs-Harkonnen faction
  asymmetry (houses), a title/main-menu + in-play pause screen, and a skirmish mode (free symmetric
  match vs a pickable AI personality)**, all on a re-verified difficulty ladder.
  Latest `npm run sim` (30-40 runs/cell, after the smart-harvester rebalance): **Easy ~100/100/100,
  Normal ~60/46/40, Hard ~75/52/22** (M1/M2/M3 player win%, averaged over 2 noisy confirmation
  runs) — a clean difficulty *ramp* (M1 easiest → M3 the hard finale), no 0%/100% cells, passive
  loses 100%. The sim bot is a LOWER BOUND, especially on M3, since it never micros Artillery
  (which the M3 brief advises) — a human does better. The surface is noisy; read at ≥30 runs.
- **Last done (newest):** **M25 — Skirmish mode.** A non-campaign custom battle launched from the
  title's new **SKIRMISH** button. A `'skirmish'` setup overlay offers three pickers — **House /
  Difficulty / Enemy AI personality** (the 5 `ai.ts` archetypes, now ordered by `PERSONALITY_ORDER` +
  a cosmetic per-archetype `blurb`) — plus Begin/Back. A skirmish is a runtime `MissionConfig`
  (`makeSkirmishConfig()` in `missions.ts` — the single source of truth shared with `sim.ts`): a
  **symmetric** start (both sides get the identical minimal core — yard+power+refinery+2 harvesters+2
  infantry — the enemy bootstrapping the rest from its AI build order), **equal credits** (the
  DIFFICULTY mults supply the Easy/Normal/Hard tilt), shared `SPICE`, `destroyAll`. Launched via a new
  shared `Game.begin()` (refactored out of `load()` so campaign + skirmish can't drift), with
  `missionIndex=-1` + `inSkirmish=true`; win/lose returns to the title. **Save/load works for skirmish**
  — the runtime config is persisted in an additive optional `SaveData.skirmish` field, discriminated by
  presence (**no `SAVE_VERSION` bump**, so existing campaign saves stay valid; Continue loads either).
  Orchestrated per the methodology: Explore (4 parallel readers) → a 3-design panel (MVP/feel/robust,
  all independently converging on symmetric) → single-hand implement (`ai → missions → ui → game →
  sim`) → adversarial review → 30-run sim → live E2E. **The review caught a game-breaking bug I'd
  missed:** the pause menu's Restart called `load(missionIndex)` with `missionIndex=-1` in a skirmish →
  `MISSIONS[-1]` undefined → crash; fixed to rebuild from the live config via `begin()` (+ a
  `missionIndex`-range guard in `quickLoad`). **Balance — campaign ladder UNCHANGED** (regression gate:
  Easy 100×4, Normal 57/63/27/77, Hard 83/50/30/23 — within the documented noise band; `begin()` is
  byte-identical construction). Skirmish band (30-run bot-vs-AI): **no broken cells** — balanced
  easy/normal/hard 100/87/100 (the turtling PlayerBot beats the attacking AI ⇒ player-favored, but a
  human's experience differs), rusher/mechanized/economist 100 (aggressive AIs suicide into the bot's
  turret line), **turtle 23** (the genuine challenge — the artillery-less bot can't crack the wall; a
  human with Artillery can), passive loses 100%. Per the documented chaos lesson, skirmish balance was
  NOT chased (exact win-rates matter less than campaign; the archetype variety IS the feature; the
  spice layout was re-checked and is roughly symmetric). Verified: clean `build`; 30-run sim (ladder +
  band above); exhaustive live E2E via `window.game` + real UI rects (title→setup→all pickers→Begin ⇒ a
  symmetric 3v3-building / 2v2-harvester world with `inSkirmish`, the chosen `ai.p.id`, and flipped
  houses; pause→restart no crash + fresh world; skirmish save→title→Continue restores credits 5555 +
  personality; win→title; campaign brief→play unaffected, AI 'balanced'; quit-to-menu); setup screen
  pixel-sampled to render; no console errors. Files: `world/ai.ts`, `game/missions.ts`, `render/ui.ts`,
  `game/game.ts`, `scripts/sim.ts`. **Committed + pushed to origin/main.**
- **Prior:** **M24 — Title/main-menu + in-play pause screens.** The game now boots to a
  full-screen **title** overlay (Campaign + Continue) instead of straight into Mission 1's brief, and a
  **pause** overlay (Resume / Restart Mission / Quit to Menu) freezes play. Both are new `Overlay`
  states (`'title'`, `'paused'`): `ui.ts` got explicit `drawTitle`/`drawPause` branches (placed
  *before* the won/lost catch-all `else` — the documented gotcha) + a `menuButton`/`menu()` stacker +
  `hitTestTitle`/`hitTestPause`; `game.ts` boots via `enterTitle()`, routes overlay clicks through a
  single `onOverlayClick` (title: Campaign→`load(0)`→brief, Continue→`quickLoad` **only when a save
  exists**), and `P` toggles pause while `Esc` cancels any pending action then pauses when idle
  (resumes when paused); `M`-mute moved to the top of `onKey` so it works on every screen, and gameplay
  hotkeys are now gated behind `overlay==='none'`. `step()` already freezes on `overlay !== 'none'`, so
  pause needed **no sim change**. The title is the entry point for the upcoming **Skirmish** mode (next).
  **Zero balance impact by construction** — `scripts/sim.ts` imports neither `game.ts` nor `ui.ts`, so
  no sim run is needed (confirmed by both adversarial-review lenses). Review-driven hardening: (1) **one
  overlay click per frame** so a fast double-click on a menu button can't fall through into the next
  screen (verified: two CAMPAIGN downs in one frame → stays on brief); (2) `hasSave` is **cached on
  title-entry**, not JSON-parsed every idle frame; (3) Continue is **truly disabled** (not just dimmed)
  with no save; (4) accurate pause hint; (5) the title is a **full-screen** dim (covers the otherwise-
  leaking mission-0 sidebar; `rightEdgeDarkFrac` 1.0). Verified: clean `build`; live E2E via
  `window.game` + real UI rects — boot→title, all button routing, P/Esc pause with the sim frozen
  (`world.time` delta 0 while paused), Esc cancel-vs-pause, the double-click guard, and a full
  **save→quit-to-menu→Continue** round trip restoring credits (7777, not the diverged value); pixel-
  sampling confirms both screens paint (gold title + button rects); no console errors. (Screenshot
  timed out = the known backgrounded-tab/rAF artifact.) Files: `src/render/ui.ts`, `src/game/game.ts`.
  **Committed + pushed to origin/main.**
- **Prior:** **M23 — Minimap "under attack" ping.** The audio under-attack alert now
  has a visual partner: `World.damage` records `alertTime/alertX/alertY` at the last hit on a player
  entity (the old private `lastAlertTime` throttle field, now public + with a location), and
  `drawMinimap` draws a pulsing red ring there for ~2.5s so you can see WHERE you're being hit. Purely
  additive + cosmetic — the under-attack emit throttle is unchanged, so **zero sim impact** (no sim
  run needed). Verified: clean `build`; live E2E (a hit on a player unit records the exact location,
  minimap renders the ping with no error); no console errors. **Committed + pushed to origin/main.**
- **Prior:** **M22 — House picker on the brief.** The player now chooses Atreides or
  Harkonnen on the mission-brief screen (two buttons next to the difficulty picker; session-persistent
  like difficulty); the enemy is always the opposite house (`otherHouse`). `World` constructor gained
  an optional `playerHouse` override (player = pick, enemy = opposite); `Game.playerHouse` threads it
  in (and `quickLoad` adopts the saved house). The brief was re-laid-out as a clean vertical flow
  (HOUSE picker + DIFFICULTY picker + variable-height brief + begin prompt; `wrap()` now returns its
  line count so the layout flows). `ui.hitTestOverlay` returns a discriminated `{house}|{difficulty}`
  pick. **Balance-safe by construction:** the houses are a perfect mirror (every TTK = 1.0 either
  way), so the flipped matchup (player Harkonnen vs Atreides enemy) is the exact mirror of the
  baseline-verified default — no re-tune needed; `sim.ts` still constructs with no override so it
  tests the default matchup. Verified: clean `build`; **30-run sim unchanged** (default matchup
  identical — the new ctor param defaults to prior behaviour); live E2E — both house buttons render +
  hit-test, clicking Harkonnen flips the matchup (player units +10% HP / enemy +10% dmg) and stays on
  the brief, pick persists; no console errors. **Committed + pushed to origin/main.**
- **Prior:** **M21 — Faction asymmetry: Atreides vs Harkonnen (the flagship).** Houses
  as an owner-wide modifier layer on the shared roster: `defs.ts` `House`/`HOUSES`, `Player.house`,
  `MissionConfig.playerHouse?/enemyHouse?` (default player = Atreides, enemy = Harkonnen — canonical
  Dune). Identity is **precision vs brute**: **Atreides +10% damage / −8% HP** (glass cannon),
  **Harkonnen +10% HP / −8% damage** (tank). Each house's damage buff exactly equals the other's HP
  buff, so they're a mirror pair. Applied at single sites: damage in `World.fire` (× `HOUSES[op.house]
  .damageMult`), unit HP in `applyUpgradeStats` (now runs for ALL units, × `hpMult`). UI: a "House
  Atreides vs House Harkonnen" line + blurb on the brief, and a house tag in the top bar. **Balance —
  the hard part:** the naive +12%-dmg-Atreides first cut drifted the ladder +20–50pp easier, because
  damage also buffs turrets + base-razing while HP doesn't. Fix = make the houses **power-neutral by
  construction**: added a per-building `maxHp` (Building field, scaled by the owner's house in
  `addBuilding`; HP-bar + repair now use `b.maxHp`) so the attacker's damage bonus is exactly cancelled
  by the defender's building HP bonus. With units, turrets, AND buildings all neutral, the **ladder
  returned to baseline** (proof the factions are balanced) — the asymmetry is tactical *feel*
  (lethality vs durability, which matters for focus-fire/splash/micro), not raw power, exactly like
  good RTS factions. Verified: clean `build`; **30-run sim back at baseline** (Easy 100×4, Normal
  63/60/30/80, Hard 83/63/33/13, passive 100% loss — vs the no-house baseline Normal 77/63/43/73,
  Hard 80/67/37/20, within noise); live E2E — Atreides player units/buildings at base×0.92, Harkonnen
  enemy at ×1.10; **save/load round-trip still byte-lossless** with the new `house`+`maxHp` fields;
  repair heals to the house-scaled cap; no console errors. **Committed + pushed to origin/main.**
- **Prior:** **M20 — Building repair (player utility).** Select a damaged player
  building, press **`R`** to toggle self-repair: `World.repairBuildings(dt)` heals it at `REPAIR_RATE`
  90 hp/s and drains the owner's credits at `REPAIR_COST_FACTOR` 0.45 × (cost/maxHp) per hp (≈45% of
  the rebuild price for a full heal), auto-stopping at full HP or when credits run out. `Building.
  repairing` flag; `World.toggleRepair`; a pulsing green "+" renders over a repairing building; a
  "Repairing"/"Repair off" toast. The flag is saved/restored (added to the building snapshot,
  backward-compatible). **Zero sim impact** — no bot ever flags `repairing`, so `repairBuildings` is
  a no-op early-continue loop in the sim. Verified: clean `build`; live E2E — `R` heals 100→280 hp in
  2s (90/s), drains credits, auto-stops at maxHp, and the flag survives a save/load round-trip; no
  console errors; **30-run sim unchanged**. **Committed + pushed to origin/main.**
- **Prior:** **M19 — Rocket Turret (anti-armour defence, data-only).** New `BUILDINGS.
  rocketturret` (1×1, cost 400, requires Radar, `power -30`, hp 520) with a **rocket-type** weapon
  (damage 30, range 200 > the Gun Turret's 170, cooldown 1.7, splash 18, `canTargetAir`). Rocket vs
  heavy = 1.4× so it's the real answer to the tank-heavy enemy pushes, and its longer range lets it
  outrange attacking tanks. Added to `BUILD_MENU_ORDER` after Radar. Pure data — the engine's generic
  building/turret machinery (draw turret head + muzzle flash, `updateTurrets` firing, sidebar icon,
  `canStartBuilding`/place pipeline) handles it with no new code; no sprite ⇒ procedural fallback.
  **Zero sim impact** (neither the AI build order nor the sim PlayerBot build order lists it, so the
  bot-vs-bot ladder can't move). Verified: clean `build`; live E2E — Radar-gated (`canStartBuilding`
  false→true once Radar owned), appears in the menu, builds through the real pipeline; **30-run sim
  unchanged**. **Committed + pushed to origin/main.**
- **Prior:** **M18 — Quick save/load (Strategic item).** `Ctrl+S` snapshots the full
  game to `localStorage`, `Ctrl+L` restores it (one slot, play-only, with an on-screen toast).
  `World.serialize()/deserialize()` capture/restore the entire sim as plain JSON: time, result, the
  **random per-mission terrain + spice arrays** (must be saved — they're `Math.random`-generated, not
  reproducible), fog, both players (credits/queues/upgrades/in-progress build/ready), and all
  buildings + units **with their ids preserved** (so `order.targetId`, selection, and control-group
  references stay valid); `reserveUnitIds/reserveBuildingIds` bump the id counters past the loaded max
  so new entities never collide. Transient cosmetics (projectiles/effects/popups/audioEvents) are
  intentionally dropped (damage is applied at fire-time, so they carry no sim state). `EnemyAI`
  serializes its dynamic state (think/waveSize/holdUntil/attacking); `Game.quickLoad` rebuilds the
  World for the saved mission/difficulty then overwrites it, and restores camera/selection/groups.
  `KeyPress.ctrl` disambiguates `Ctrl+S` (save) from plain `S` (stop); `input.ts` preventDefaults the
  browser Save/address-bar defaults. Verified: clean `build`; **30-run sim unchanged** (purely
  additive to sim files — no existing code path touched); live E2E — a **save→diverge→load round-trip
  is byte-for-byte lossless** (re-serialize after load === the saved snapshot), credits/time restored
  (not the diverged values), all entity ids unique, **0 dangling targetId refs**, selection + control
  group restored, and `Ctrl+S` saves without triggering Stop (plain `S` still stops). **Committed +
  pushed to origin/main.**
- **Prior:** **M17 — Objective/win-condition types + a survive mission (item 5).**
  Generalized victory from hardcoded last-base-standing into `MissionConfig.objective?: {kind,
  timeLimit?, targetDefId?}` with 4 kinds: **destroyAll** (default — existing missions unchanged),
  **destroyTarget** (raze a named enemy structure), **survive** (hold to a timer; wiping them early
  also wins), **defend** (protect a named player building to a timer). `world.checkVictory()` branches
  on it (losing your whole base is always a loss first). UI: a **HOLD/DEFEND m:ss countdown** in the
  top bar for timed objectives + objective-aware VICTORY/DEFEAT subtext. New **Mission 4 — "Last
  Stand"** showcases `survive` (hold 240s vs a heavy assault), expanding the campaign to **4
  missions**. Verified: clean `build`; **30-run sim** — M1–M3 unchanged (default destroyAll; Normal
  70/63/27, Hard 90/60/47), new **M4 survive Easy 100 / Normal 73 / Hard 33** after trimming the
  early pre-placed army (the wave that hit before a defence could stand up — bot is a poor survive
  proxy since it *attacks* not turtles, so a human does even better), passive 100% loss; live E2E —
  all 4 objective kinds confirmed (survive→won on the clock, base-loss→lost, destroyTarget→won when
  the named building dies, defend→lost when the protected building falls even with 6 others alive),
  no console errors. **Committed + pushed to origin/main.**
- **Prior:** **M16 — AI personality system (item 4; system shipped, campaign on the
  balanced default).** Refactored `EnemyAI` from one scripted style into one brain + parameterized
  `PERSONALITIES` (knobs: build order, aggressionMult, waveCapMult, rocketRatio, infantry reserves,
  upgrade threshold, harvester target). Five archetypes: **balanced** (reproduces the historical
  behaviour byte-for-byte), **turtle** (turret wall, late/bigger army), **rusher** (lean, infantry
  flood, early commit), **mechanized** (factory-first, tank-heavy), **economist** (double-refinery
  boom, late oversized army). `MissionConfig.aiPersonality?` threads through `game.ts` + `scripts/
  sim.ts`; unset ⇒ balanced. **The system works** — assigning archetypes swung the 30-run sim
  wildly (rusher M1 → 100/100/100 too easy as infantry self-destructs on defence; mechanized M2 →
  87/7/3 as tanks crush the bot; turtle M3 → 87/0/0, a broken 0% cell the artillery-less bot can't
  crack) — which is exactly why **the campaign stays on balanced**: per-mission archetype assignment
  needs a dedicated rebalance (the documented chaotic wildcard), deferred to a focused balance
  session / skirmish mode, not guessed autonomously. Deliberately **skipped the "smarter sim bot"**
  half of item 4 per the Known-Issues lesson (giving the bot Artillery made it worse; its
  tanks+rockets+upgrades comp is the best proxy). Verified: clean `build`; **30-run sim** with the
  balanced default = the verified ladder intact (Easy 100/100/100, Normal 67/50/30, Hard 80/70/33,
  passive 100% loss); live E2E — campaign `EnemyAI.p.id === 'balanced'`, no console errors.
  **Committed + pushed to origin/main.**
- **Prior:** **M15 — Control groups + clip-through repath fix (item 3 / Quick RTS QoL).**
  (1) **Control groups**: `Shift`/`Ctrl`+`1`–`9` assigns the current selection to a group, the bare
  digit selects it, double-tapping a digit (≤350ms) re-centres the camera on the group. Input now
  captures modifier state *with* each keypress (`KeyPress{code,ctrl,shift}`) so assign-vs-select is
  unambiguous; `input.ts` best-effort `preventDefault`s modifier+digit (Shift is the reliable assign
  — bare Ctrl+digit is a browser tab-switch on most browsers). Groups live on `game.ts`
  (`Map<number,number[]>`, pruned of dead units on select, cleared on mission load). (2) **Repath
  fix**: `world.rebuildBlocked()` (called whenever a building is placed/destroyed) now clears the
  path of any unit whose route crosses a newly-blocked tile + resets its `repathTimer`, so a unit no
  longer clips through a just-placed building for up to 0.4s — it recomputes next tick. Verified:
  clean `build`; **30-run sim** clean ramp + passive 100% loss (Easy 100/100/100, Normal 57/50/37,
  Hard 73/53/40 — the repath change left balance healthy); live E2E via `window.game` (Shift+digit
  AND Ctrl+digit assign 3 units, plain digit re-selects them, double-tap centred the camera; placing
  a building on a 13-waypoint path cleared it instantly, `repathTimer→0`; no console errors).
  **Committed + pushed to origin/main.**
- **Prior:** **M14 — Combat juice (cosmetic, zero balance impact).** Three additions,
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
- **Next action (start here next session):** The whole numbered plan + every Strategic item +
  cheap wins + the title/pause UI + **skirmish mode** are **done** (M13–M25, all committed + live).
  Candidate next items (pick by appetite):
  • **Stronger / less-suicidal enemy AI** (the highest-value gameplay improvement) — the skirmish
    sim exposed that the AI throws its army into a turtle's turret line and dies (balanced/rusher/mech/
    econ all ~100% player win vs the turtling bot; only `turtle` challenges it). An AI that probes
    defences, focuses production buildings, and retreats from turret fire would make BOTH skirmish and
    campaign harder + more lifelike. This is balance-bound + chaotic (sim is the oracle; never
    parallelize) — its own focused session.
  • **Skirmish polish** (small, low-risk): a post-match REMATCH button (currently win/lose → title;
    settings persist so it's one click to re-run), mirrored/randomized spice for more map variety, a
    "random" AI option, or a starting-credits/army-size slider.
  • **Distinct rosters / superweapons per house** (deeper asymmetry — content + chaotic balance; the
    flagship "Dune feel" upgrade on the M21 house foundation).
  • **Unit veterancy** (balance-bound), then perf (spatial partitioning — only when it hurts), and
    multiplayer (last). The skirmish setup overlay (`drawSkirmish`/`hitTestSkirmish` in `ui.ts`,
    `makeSkirmishConfig` in `missions.ts`) is the natural home for any new match-setup options.

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
- **Save/load is a plain-JSON state snapshot, not a replay.** `World.serialize/deserialize` capture
  the whole sim as plain data. Two things are load-bearing: (1) the **map terrain + spice are
  `Math.random`-generated per mission**, so they MUST be saved (you can't regenerate them); (2)
  **entity ids are preserved** on restore (units/buildings keep their saved id) because `order.targetId`,
  the controller's selection, and control groups all reference ids — then `reserveUnit/BuildingIds`
  push the module id counters past the loaded max so future spawns never collide. Transient cosmetics
  (projectiles/effects/popups) are dropped — damage is applied at fire-time so a shot mid-flight holds
  no sim state. The save lives in one `localStorage` slot, version-gated (`SAVE_VERSION`), play-only.
- **Faction asymmetry (houses) is a power-NEUTRAL, owner-wide modifier layer.** `Player.house`
  (`atreides | harkonnen`) → `HOUSES[house]` gives a `damageMult` (applied in `World.fire`, covering
  units + turrets) and an `hpMult` (applied to units in `applyUpgradeStats` AND to buildings via the
  per-building `maxHp` set in `addBuilding`). The two houses are a **mirror pair** — Atreides
  `{dmg 1.10, hp 0.92}`, Harkonnen `{dmg 0.92, hp 1.10}` — chosen so each house's damage buff exactly
  equals the other's HP buff. Because HP is applied to buildings too, EVERY combat interaction (unit
  trades, turret fire, base-razing) has time-to-kill = `targetHP/attackerDmg` = 1.0 both ways, so the
  houses are power-neutral and the verified ladder is preserved (the sim returning to baseline is the
  proof of balance). The asymmetry is therefore **tactical feel** (glass-cannon lethality vs brute
  durability — affects focus-fire, splash, retreat decisions, micro), not raw win-rate. **Lesson
  burned in:** the first cut (Atreides +12% damage only) drifted the ladder +20–50pp easier because
  damage is more universally useful than HP (it buffs turrets + razing, which HP didn't offset);
  neutralizing required giving buildings the HP modifier too. Deeper asymmetry (distinct rosters /
  superweapons) is a future content+balance layer on this foundation. Default campaign matchup =
  Atreides player vs Harkonnen enemy.
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
- [x] **M15 — Control groups + repath fix (Quick RTS QoL).** Shift/Ctrl+1–9 assign, digit selects,
  double-tap centres; `KeyPress{code,ctrl,shift}` captures modifiers at press time. `rebuildBlocked()`
  invalidates any unit path crossing a newly placed/destroyed building so units stop clipping
  through for ~0.4s. ✅
- [x] **M16 — AI personality system.** `EnemyAI` parameterized over `PERSONALITIES` (balanced /
  turtle / rusher / mechanized / economist); `MissionConfig.aiPersonality?` (default balanced).
  System verified (archetypes swing the sim 40–90pp); campaign kept on balanced so the verified
  ladder is preserved — per-mission archetype tuning deferred (chaotic). Skipped the "smarter sim
  bot" half (Known-Issues: it made the bot worse). ✅ (system; campaign tuning deferred)
- [x] **M17 — Objective / win-condition types + survive mission.** `MissionConfig.objective?`
  (destroyAll default / destroyTarget / survive / defend); `checkVictory()` branches; HOLD/DEFEND
  countdown HUD + objective-aware overlay text. New Mission 4 "Last Stand" (survive 240s) →
  campaign is now 4 missions. Sim: M1–M3 unchanged, M4 Easy 100 / Normal 73 / Hard 33. ✅
- [x] **M18 — Quick save/load.** `Ctrl+S`/`Ctrl+L` snapshot/restore the full game to `localStorage`.
  `World.serialize/deserialize` (terrain+spice+fog arrays, players, buildings+units with ids
  preserved; transient FX dropped) + `EnemyAI.serialize/restore`; `reserveUnit/BuildingIds` bump the
  id counters. Round-trip proven byte-lossless live; sim unchanged (additive). ✅
- [x] **M19 — Rocket Turret.** Data-only `BUILDINGS.rocketturret` (Radar-gated anti-armour defence:
  rocket-type, range 200, splash, `canTargetAir`) + `BUILD_MENU_ORDER`. Reuses the generic turret
  machinery; zero sim impact (no bot builds it). ✅
- [x] **M20 — Building repair.** `R` toggles self-repair on a selected player building (`World.
  repairBuildings`: 90 hp/s, drains credits ~45% of rebuild cost, auto-stops at full); pulsing green
  "+" indicator; saved/restored. Zero sim impact (no bot repairs). ✅
- [x] **M21 — Faction asymmetry (Atreides vs Harkonnen).** `HOUSES` owner-wide modifiers: Atreides
  +10% damage / −8% HP (glass cannon), Harkonnen +10% HP / −8% damage (tank) — a mirror pair, made
  power-NEUTRAL by also applying HP to buildings (per-building `maxHp`), so the ladder is preserved
  (the asymmetry is tactical feel, not raw power). House identity on the brief + top bar; house +
  building maxHp round-trip through save/load. Default: player Atreides vs enemy Harkonnen. ✅
- [x] **M22 — House picker.** Choose your House on the brief (session-persistent; enemy = opposite).
  `World(config, difficulty, playerHouse?)` override; brief re-laid-out as a flowing layout
  (`wrap()` returns line count); `hitTestOverlay` → `{house}|{difficulty}`. Mirror-balanced so either
  matchup is in-band; sim unchanged. ✅
- [x] **M23 — Minimap "under attack" ping.** `World.damage` records `alertTime/alertX/alertY`;
  `drawMinimap` pulses a red ring there for ~2.5s (visual partner to the audio alert). Cosmetic;
  zero sim impact. ✅
- [x] **M24 — Title + pause screens.** New `Overlay` states `'title'` (full-screen main menu:
  Campaign + Continue) and `'paused'` (Resume / Restart / Quit-to-Menu). Boots to the title;
  `P`/`Esc` toggle pause (`step()` already freezes on any overlay). UI-only (`ui.ts` draw/hit-test +
  `game.ts` routing); zero sim impact (sim never imports either file). Title is the Skirmish entry
  point (added next). ✅
- [x] **M25 — Skirmish mode.** Title `SKIRMISH` button → a `'skirmish'` setup overlay (House /
  Difficulty / Enemy AI personality pickers + Begin/Back). `makeSkirmishConfig()` (missions.ts,
  shared with sim.ts) = a symmetric minimal-core start, equal credits, `destroyAll`. Launched via a
  shared `Game.begin()` (refactored from `load()`), `missionIndex=-1`, `inSkirmish` flag; win/lose →
  title. Save/load works (additive optional `SaveData.skirmish`, no version bump). `PERSONALITY_ORDER`
  + `blurb` added to `ai.ts`. Campaign ladder unchanged; skirmish band has no broken cells. ✅

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
3. ~~**Quick RTS QoL**~~ ✅ **DONE (M15).** Control groups (Shift/Ctrl+1–9 assign, digit select,
   double-tap centre — Shift is the reliable assign since Ctrl+digit is a browser tab-switch) + the
   repath fix (a placed/destroyed building now invalidates crossing unit paths immediately).
4. **~~AI personalities~~ ✅ SYSTEM DONE (M16); campaign tuning + smarter bot DEFERRED.** Built the
   parameterized archetype system (balanced/turtle/rusher/mechanized/economist) — it works (swings
   the sim 40–90pp) but assigning archetypes to campaign missions broke the ladder (rusher too easy,
   mechanized/turtle too hard → 0% cells), so the campaign stays on `balanced` and per-mission
   archetype tuning is deferred to a focused balance session / skirmish mode. The "smarter sim bot"
   half was deliberately SKIPPED (Known-Issues: giving the bot Artillery made it worse).
5. **~~Objective / win-condition types~~ ✅ DONE (M17).** Built the system (destroyAll/destroyTarget/
   survive/defend) + a HOLD/DEFEND countdown HUD + objective-aware overlay text, and a new survive
   mission (M4 "Last Stand", campaign now 4 missions; Easy 100 / Normal 73 / Hard 33). Adding more
   destroyTarget/defend missions to reach 5–6 is now just per-mission content + a small tune each.
   Note: the sim bot is a poor proxy for *survive/defend* (it attacks instead of turtling → it
   under-states those) — read those cells as a lower bound even more than the destroy missions.

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

- **Skirmish: a turtling player beats the attacking AI from a symmetric start (M25).** The 30-run
  skirmish sim (symmetric minimal-core start, both bots building from scratch) showed the defensive
  PlayerBot (turret-first, defend, then push) beats `EnemyAI` in nearly every matchup — balanced
  100/87/100 (easy/normal/hard), rusher/mechanized/economist 100% — because the AI a-moves its army
  into the player's turret line and dies (the documented inverted-aggression effect). Only `turtle`
  (the AI walls up; the artillery-less bot can't crack it) challenges the bot at 23%. This is NOT a
  broken-cell problem (no 0%/100%-unwinnable, no <90s stomp, passive loses 100%) and skirmish exact
  win-rates matter less than campaign — but it pinpoints the **single highest-value gameplay
  improvement: a less-suicidal enemy AI** (probe defences / focus production / retreat from turret
  fire) that would harden both skirmish AND campaign. The root cause is AI *behaviour*, not a tunable
  credit/aggression knob (more enemy credits → bigger army thrown away → still loses), so it's a
  focused AI session, not a balance tweak. Per the chaos lesson, skirmish balance was deliberately
  NOT chased; the archetype variety (turtle hard, others easy) is the player-facing feature.
- **AI archetypes swing win-rate 40–90pp vs the fixed sim bot (M16).** Measured: assigning
  `rusher` → M1 100/100/100 (infantry floods self-destruct on the player's turrets, so the mission
  gets EASIER); `mechanized` → M2 87/7/3 and `turtle` → M3 87/0/0 (tanks / a turret-wall crush the
  artillery-less bot, so those missions get much HARDER, hitting broken 0% cells). Lesson: archetype
  power level is dominated by COMPOSITION vs the bot (infantry weak, tanks/turrets strong), not by
  a tunable multiplier — so a personality can't be dropped into a campaign mission without a full
  per-mission rebalance. The system ships with the campaign on `balanced` for exactly this reason;
  archetype assignment belongs to a focused balance pass (or skirmish mode, where exact win-rates
  matter less). Knobs live in `ai.ts PERSONALITIES`.
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
- **2026-06-14** — **M25: Skirmish mode.** Orchestrated per the methodology: a **Workflow Explore
  phase** (4 parallel readers mapping missions/world/tilemap/ai+defs) → a **3-design panel**
  (MVP/feel/robustness — all independently converged on a SYMMETRIC start) → single-hand implement in
  dependency order (`ai.ts` PERSONALITY_ORDER+blurb → `missions.ts` makeSkirmishConfig → `ui.ts`
  'skirmish' overlay + SKIRMISH title button → `game.ts` inSkirmish/begin()/routing/save-load →
  `sim.ts` runConfig refactor + skirmish cells) → **adversarial review** → 30-run sim → live E2E.
  Design calls (all the lower-risk option): symmetric start (the AI bootstraps from a yard, so equal
  minimal cores work), fixed shared `SPICE` (terrain already varies per construction; spice re-checked
  roughly symmetric), a dedicated `'skirmish'` overlay reusing the picker primitives, win/lose→title,
  and save/load support via an additive optional `SaveData.skirmish` (no SAVE_VERSION bump → campaign
  saves stay valid). **The review caught a game-breaking bug**: pause→Restart called
  `load(missionIndex)` with `missionIndex=-1` in skirmish → `MISSIONS[-1]` undefined → crash; fixed to
  rebuild from the live config via `begin()` (+ a quickLoad missionIndex-range guard). The campaign
  ladder is unchanged (Easy 100×4, Normal 57/63/27/77, Hard 83/50/30/23 — within noise; `begin()` is
  byte-identical construction). Skirmish band: no broken cells; the turtling PlayerBot beats the
  attacking AI (balanced 100/87/100, rusher/mech/econ 100, turtle 23 = the real challenge, passive
  loses) — documented as the next AI-improvement target, not chased (chaos lesson). Live E2E: full
  title→setup→Begin→play→pause/restart→win→title loop + skirmish save/load round trip (credits 5555 +
  personality restored) + campaign unaffected, all via window.game + real UI rects; setup screen
  pixel-rendered; no console errors. Files: `world/ai.ts`, `game/missions.ts`, `render/ui.ts`,
  `game/game.ts`, `scripts/sim.ts`. (committed + pushed 2026-06-14).
- **2026-06-14** — **M24: Title/main-menu + in-play pause screens.** Built as a light-orchestration
  session per the methodology (UI on shared files = one hand): a **Workflow understand-pass** (2 parallel
  readers mapping `ui.ts` overlay/hit-test + `game.ts` boot/step/input/save), then I implemented
  single-hand, then a **Workflow adversarial-review panel** (2 lenses: correctness/edge-cases +
  regression risk). Added `Overlay` states `'title'`/`'paused'`: `ui.ts` `drawTitle`/`drawPause` (before
  the won/lost catch-all `else`) + `menuButton`/`menu()` + `hitTestTitle`/`hitTestPause` + a full-screen
  dim for the title; `game.ts` boots via `enterTitle()`, a single `onOverlayClick` routes title
  (Campaign→`load(0)`, Continue→`quickLoad` only if a save exists) + pause (resume/restart/menu), `P`
  toggles pause, `Esc` cancels-then-pauses (resumes when paused), `M`-mute hoisted to work everywhere,
  gameplay hotkeys gated to `overlay==='none'`. Review found + I fixed: **one overlay click/frame**
  (double-click can't skip the brief), **cached `hasSave`** (no per-frame JSON.parse of the save blob on
  the idle title), **Continue truly disabled** (not just dimmed) with no save, accurate pause hint.
  **Zero sim impact** — `scripts/sim.ts` imports neither file (both review lenses confirmed), so no sim
  run. Verified: clean `build`; exhaustive live E2E via `window.game` + real UI rects (21+ assertions:
  boot→title, every button route, P/Esc pause with `world.time` frozen, Esc cancel-vs-pause, the
  double-click guard via two queued leftdowns in one frame, save→quit-to-menu→Continue restoring
  credits, cache lights Continue after a save) + pixel-sampling both screens paint; no console errors.
  Files: `src/render/ui.ts`, `src/game/game.ts`. (committed + pushed 2026-06-14).
- **2026-06-14** — **M23: Minimap under-attack ping.** `World.damage` now records `alertTime/alertX/
  alertY` (the under-attack throttle field, made public + located); `ui.drawMinimap` pulses a red ring
  at that spot for ~2.5s — the visual partner to the audio alert. Additive + cosmetic; the emit
  throttle is unchanged → zero sim impact. Verified: clean build; live E2E (alert records the exact
  hit location, minimap renders the ping); no console errors. Files: `world/world.ts`, `render/ui.ts`.
  (committed + pushed 2026-06-14).
- **2026-06-14** — **M22: House picker on the brief.** Player picks Atreides/Harkonnen on the brief
  (session-persistent like difficulty; enemy = `otherHouse`). `World` ctor gained an optional
  `playerHouse` override (player = pick, enemy = opposite); `Game.playerHouse` threads it through
  `load()` + `quickLoad` (adopts the saved house). Brief re-laid-out as a vertical flow (HOUSE picker
  + DIFFICULTY picker + variable-height brief + begin), enabled by making `wrap()` return its line
  count. `ui.hitTestOverlay` now returns a discriminated `{house}|{difficulty}`; `game.ts` routes
  both to `reloadBrief()`. Balance-safe by the mirror symmetry (flipped matchup = exact mirror of the
  baseline default; `sim.ts` still tests the default with no override). Verified: clean `build`;
  30-run sim unchanged; live E2E (both buttons render+hit-test; clicking Harkonnen flips player→+HP /
  enemy→+dmg, stays on brief, pick persists); no console errors. Files: `world/{defs,world}.ts`,
  `game/game.ts`, `render/ui.ts`. (committed + pushed 2026-06-14).
- **2026-06-14** — **M21: Faction asymmetry — Atreides vs Harkonnen (flagship).** Added a `House`
  modifier layer (`defs.ts` HOUSES, `Player.house`, `MissionConfig.playerHouse?/enemyHouse?`, default
  Atreides player vs Harkonnen enemy). Identity = precision vs brute: Atreides `{dmg 1.10, hp 0.92}`,
  Harkonnen `{dmg 0.92, hp 1.10}` (a mirror pair). Applied at single sites — damage in `World.fire`,
  unit HP in `applyUpgradeStats` (de-restricted to all kinds). UI: brief matchup line + blurb, top-bar
  house tag. **The balance journey (3 sim passes):** (1) first cut Atreides +12% dmg / Harkonnen +12%
  HP → ladder +15–25pp easier; (2) symmetric ±10% glass-cannon/tank → STILL easier (Hard 87/87/77/70
  vs baseline 80/67/37/20, +40-50pp on M3/M4) because damage buffs turrets + base-razing where HP
  doesn't; (3) FIX = give buildings the HP modifier too (new per-building `maxHp`, scaled in
  `addBuilding`; HP-bar + repair use `b.maxHp`) → every interaction neutral (TTK = targetHP/dmg = 1.0)
  → **ladder back to baseline** (Easy 100×4, Normal 63/60/30/80, Hard 83/63/33/13, passive 100% loss).
  So the houses are power-neutral (= balanced) and differ in tactical feel, not strength — the right
  RTS-faction design. Live E2E: units+buildings scaled per house; **save/load round-trip still
  byte-lossless** with new `house`+`maxHp` fields; repair heals to the scaled cap; no console errors.
  Files: `world/{defs,player,world,building}.ts`, `render/{renderer,ui}.ts`. (committed + pushed 2026-06-14).
- **2026-06-14** — **M20: Building repair (player utility "Then" item).** `R` on a selected player
  building toggles `Building.repairing`; `World.repairBuildings(dt)` (new, called in `update()` before
  `cleanup`) heals at `REPAIR_RATE` 90 hp/s and drains the owner's credits at `REPAIR_COST_FACTOR`
  0.45×(cost/maxHp) per hp, auto-stopping at full HP / when credits hit 0 (partial heal when low).
  `World.toggleRepair` (ignored at full HP). Renderer draws a pulsing green "+" over repairing
  buildings; `game.ts` shows a Repairing/Repair-off toast. The flag is added to the building
  save-snapshot (optional field → backward-compatible, no SAVE_VERSION bump). Zero sim impact — no
  AI/bot flags `repairing`, so the loop just early-continues in the headless sim. Verified: clean
  `build`; live E2E (R heals 100→280 in 2s = 90/s, drains credits, auto-stops at maxHp 350, flag
  survives save→load); no console errors; 30-run sim unchanged. Files: `world/{constants,building,
  world}.ts`, `game/game.ts`, `render/renderer.ts`. (committed + pushed 2026-06-14).
- **2026-06-14** — **M19: Rocket Turret (cheap "Then" item).** Added `BUILDINGS.rocketturret` — a
  Radar-gated 1×1 anti-armour turret (rocket weapon: dmg 30, range 200, cooldown 1.7, splash 18,
  `canTargetAir`; 520 hp, cost 400, power -30) + an entry in `BUILD_MENU_ORDER`. Rocket vs heavy 1.4×
  + longer range than the Gun Turret = the dedicated counter to tank pushes. Pure data: the generic
  building/turret code (renderer turret-head + muzzle flash, `updateTurrets`, sidebar icon,
  `canStartBuilding`/`startBuilding`/`placeReady`) handles it; tsc validates the def against the
  `BuildingDef`/`WeaponDef` interfaces. Zero sim impact — neither `ai.ts` BUILD_ORDER nor
  `sim.ts` PLAYER_BUILD_ORDER lists it, so the ladder can't move. Verified: clean `build`; live E2E
  (Radar prereq gates it false→true, shows in the menu, builds via the real pipeline); 30-run sim
  unchanged. Files: `world/defs.ts`. (committed + pushed 2026-06-14).
- **2026-06-14** — **M18: Quick save/load (Strategic item).** `Ctrl+S`/`Ctrl+L` snapshot+restore the
  whole game to a single `localStorage` slot (play-only, toast feedback). `World.serialize()` →
  plain JSON: time/result, the random per-mission **terrain + spice** arrays (saved, not regenerated)
  + fog, both Players (credits/queues/upgrades/in-progress build/ready), and all buildings + units
  with **ids preserved**; `deserialize()` overwrites a freshly-constructed World for the saved
  mission/difficulty (`.set()` into the readonly typed arrays, clear+rebuild entity lists, cast-assign
  saved ids, `reserveUnit/BuildingIds` to bump the counters, `rebuildBlocked()`). Transient FX
  (projectiles/effects/popups/audioEvents) dropped (no sim state). `EnemyAI.serialize/restore` covers
  think/waveSize/holdUntil/attacking. Controller: `Game.quickSave/quickLoad` (+ camera/selection/
  groups), a 2.5s toast, `KeyPress.ctrl` to split `Ctrl+S` (save) from plain `S` (stop), and
  `input.ts` preventDefaults the browser Ctrl+S/Ctrl+L defaults. Verified: clean `build`; **30-run sim
  unchanged** (additive only — no existing sim path touched); live E2E — **save→diverge→load round
  trip is byte-for-byte lossless** (`serialize()` after load === the saved snapshot), credits/time
  restored over the diverged values, all ids unique, 0 dangling `targetId`, selection + group
  restored; `Ctrl+S` saved without stopping a moving unit + plain `S` still stops; no console errors.
  Files: `world/{world,unit,building,ai}.ts`, `core/input.ts`, `game/game.ts`, `render/ui.ts`.
  (committed + pushed 2026-06-14).
- **2026-06-14** — **M17: Objective/win-condition types + survive mission (item 5).** Generalized
  `world.checkVictory()` from hardcoded last-base-standing into `MissionConfig.objective?:
  {kind:'destroyAll'|'destroyTarget'|'survive'|'defend', timeLimit?, targetDefId?}` (default
  destroyAll ⇒ existing missions byte-identical; losing your whole base is always a loss first;
  survive/defend also win if you wipe the enemy early). `ui.ts`: a HOLD/DEFEND m:ss countdown in the
  top bar for timed objectives + objective-aware VICTORY/DEFEAT subtext. New **Mission 4 "Last
  Stand"** (survive 240s vs a heavy assault) — campaign now 4 missions. Tuning: first cut (aggression
  1.3, 3 tanks/2 rockets pre-placed) gave Hard M4 = 3% — but the **sim bot attacks instead of
  turtling**, so it badly under-states survive missions; trimming the early pre-placed army to 2
  tanks/1 rocket (the wave that hit before any defence could stand up) lifted it to a clean **Easy
  100 / Normal 73 / Hard 33**. M1–M3 unchanged (default destroyAll), passive 100% loss. Live E2E: all
  4 objective kinds verified (survive→won on the clock; base-loss→lost; destroyTarget→won when the
  named enemy building dies; defend→lost when the protected building falls even with 6 others alive),
  no console errors. Files: `world/world.ts` (Objective + checkVictory), `render/ui.ts` (timer HUD +
  overlay text), `game/missions.ts` (Mission 4). (committed + pushed 2026-06-14).
- **2026-06-14** — **M16: AI personality system (item 4).** Refactored `EnemyAI` into one brain +
  `PERSONALITIES` knobs (build order / aggressionMult / waveCapMult / rocketRatio / infantry reserves
  / upgradeThreshold / harvesterTarget); 5 archetypes (balanced=historical, turtle, rusher,
  mechanized, economist). Threaded `MissionConfig.aiPersonality?` through `game.ts` + `scripts/sim.ts`
  (unset⇒balanced). Tried assigning rusher/mechanized/turtle to M1/M2/M3: sim = M1 100/100/100 (rusher
  trivialises — infantry die on defence), M2 87/7/3 (mechanized tanks crush the bot), M3 87/0/0
  (turtle turret-wall = broken 0% cells). ⇒ **reverted campaign to balanced** (ladder preserved:
  Easy 100/100/100, Normal 67/50/30, Hard 80/70/33, passive 100% loss) and documented that
  per-mission archetype tuning is the deferred chaotic work (belongs to a balance session / skirmish).
  **Skipped the "smarter sim bot"** half deliberately (Known-Issues: bot+Artillery was worse). The
  archetype system is real infrastructure (verified to produce distinct play) ready for skirmish.
  Live E2E: campaign `EnemyAI.p.id==='balanced'`, no console errors. Files: `world/ai.ts` (rewrite),
  `world/world.ts` (MissionConfig field), `game/game.ts`, `scripts/sim.ts`, `game/missions.ts`.
  (committed + pushed 2026-06-14).
- **2026-06-14** — **M15: Control groups + repath fix (item 3 / Quick RTS QoL).** (1) **Control
  groups**: `input.ts` now records `KeyPress{code,ctrl,shift}` (modifiers captured at press time, so
  a fast modifier release can't make assign read as select) + best-effort `preventDefault` on
  modifier+digit. `game.ts` holds `groups: Map<number,number[]>` + `handleGroupKey`: Ctrl/Shift+digit
  assigns the selection, bare digit selects (pruning dead ids), a 2nd tap within 350ms re-centres via
  `centerOnGroup` (centroid). Groups clear on mission load. Shift is the documented reliable assign —
  Ctrl+digit is a reserved browser tab-switch. (2) **Repath fix**: `world.rebuildBlocked()` (already
  called on every building add/remove) now also walks each unit's path and, if any waypoint is now
  blocked, `clearPath()` + `repathTimer=0` so the unit recomputes next tick instead of clipping
  through a just-placed building for up to 0.4s. (Units array is empty during the constructor's
  rebuildBlocked calls, so no spurious work at setup.) Verified: clean `build`; **30-run sim** clean
  ramp + passive 100% loss (Easy 100/100/100, Normal 57/50/37, Hard 73/53/40 — the movement change
  left balance healthy); live E2E (Shift+digit AND Ctrl+digit assigned 3 units, plain digit
  re-selected them, double-tap centred the camera y 0→1234; a building dropped on a 13-waypoint path
  cleared it instantly with repathTimer→0; no console errors). Files: `core/input.ts`, `game/game.ts`,
  `world/world.ts`, docs. (committed + pushed 2026-06-14).
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
