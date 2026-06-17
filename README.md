# Dune Clone — a browser RTS

A real-time strategy game in the spirit of **Dune II / Command & Conquer**, written from
scratch in **TypeScript + HTML5 Canvas** (no game engine), bundled with Vite.

Harvest spice → bank credits → raise a base from your Construction Yard → manage power and
tech tiers → build infantry, vehicles, and aircraft → command them in continuous real-time
combat across a campaign, a free-play skirmish, or **2-player online multiplayer**.

> **▶ Play it live: <https://holsteredsoul.github.io/dune-clone/>**
> (GitHub Pages — single-player campaign + skirmish vs the AI. Multiplayer is run locally/LAN;
> see [Multiplayer](#multiplayer) below.)

## Features

- **Economy** — harvesters mine spice and return it to a refinery for credits; spice fields
  deplete. **Smart harvesting:** a harvester returns the moment it's full, tops off from spice
  within sight when a tile runs dry, and only heads home / seeks a new patch when none is near.
- **Base building** — Construction Yard build menu, ghost placement, power balance (low power
  slows production), and a tech tree (Power → Refinery/Barracks → Radar → Factory → Helipad).
  **Left-click a sidebar icon to queue, right-click to cancel one (full refund).** Multiple
  Barracks / War Factories **build in parallel** for more throughput.
- **Units** — a full roster across three tiers: **Light Infantry · Rocket Trooper** (infantry);
  **Harvester · Recon Buggy · Battle Tank · Artillery** (vehicles); **Ornithopter** (aircraft).
  Produced via power-scaled queues with optional **rally points**.
- **Rock-paper-scissors combat** — every unit has an **armor class** and every weapon a
  **damage type**, scaled through a `DAMAGE_VS_ARMOR` table (guns shred infantry but bounce off
  tanks; rockets punch armour *and* aircraft; shells flatten infantry but struggle vs heavies).
  Plus **anti-air discipline** (only Rocket Troopers / turrets hit flyers), Artillery **min-range
  + splash**, travelling projectiles, splash damage, and re-acquire-after-kill.
- **Upgrades** — purchasable at the Radar: Depleted Rounds (+dmg), Composite Armor (+vehicle HP),
  Turbo Drives (+vehicle speed), Salvage Logistics (+harvest yield).
- **Houses** — pick **Atreides** (glass cannon: +damage / −HP) or **Harkonnen** (tank: +HP /
  −damage). A power-neutral mirror pair, so the asymmetry is tactical *feel*, not raw power.
- **Real-time command** — box/click selection, A* pathfinding, attack-move, hold, guard, stop,
  four **stances** (Aggressive / Guard / Hold-Ground / Hold-Fire), and **control groups** (1–9).
- **Enemy AI** — economy build-order, unit training (fields Rocket Troopers + Recon Buggies and
  buys an upgrade), capped attack waves, and **five personality archetypes** (balanced / turtle /
  rusher / mechanized / economist) selectable in skirmish.
- **Campaign** — **4 escalating missions** with fog of war, briefings, and multiple objective
  types (destroy the base · raze a target · **survive** a timed onslaught · defend).
- **Skirmish** — a free, symmetric custom battle: pick your House, the difficulty, and the enemy
  AI personality, then fight from a bare economy.
- **Multiplayer** — **2-player human-vs-human** over the network via deterministic lockstep
  (see [Multiplayer](#multiplayer)).
- **Difficulty** — Easy / Normal / Hard, selectable on the brief / skirmish screens.
- **Presentation & feel** — procedural **Web Audio** (per-weapon fire, build, explosion,
  under-attack, victory cues; mute with `M`), floating damage numbers + hit-flash, optional
  **building sprites** (drop a `building-<id>.png` into `assets/sprites/`, auto-discovered;
  procedural fallback otherwise), name tags, and **explosion FX** (a `fx-explosion.png`
  sprite-sheet if present, else a procedural blast). See `assets/sprites/*.md` for the art specs.
- **Menus & saves** — a title/main-menu and an in-play pause screen; one-slot **quick save/load**
  (`Ctrl+S` / `Ctrl+L`) for single-player.
- **Balance, measured** — a headless simulation harness (`npm run sim`) pits a scripted player
  bot against the AI across every mission × difficulty. The campaign is tuned as a difficulty
  *ramp* with no sub-90-second stomps and a passive player losing every time. (The bot under-states
  the later missions — it doesn't micro Artillery the way a human would.)

## Run

```bash
npm install
npm run dev      # dev server with hot reload — open the printed localhost URL
npm run build    # type-check + production build to dist/
npm run sim      # headless balance simulation (bot vs AI across the ladder)
npm run relay    # multiplayer relay server (see Multiplayer below)
npm run nettest  # headless 2-client lockstep determinism check (needs the relay running)
```

## Multiplayer

2-player human-vs-human, built on the engine's **deterministic lockstep**: clients exchange only
tiny per-tick *command* messages and each runs the identical simulation, so there's almost nothing
to send over the wire. The host generates the world once and ships a snapshot so both clients start
byte-identical; a periodic state checksum detects (and halts on) any divergence.

A browser can't accept inbound connections, so players connect *out* to a tiny **relay** server
(Node + `ws`) that simply forwards messages — it runs no game logic. The relay is **optional and
local**: it's never part of the production build, and single-player needs nothing new.

### Hosting a match (LAN / local)

1. **One player runs the relay:**
   ```bash
   npm run relay        # listens on ws://localhost:8787  (set PORT=… to change)
   ```
2. **Both players open the game** with a local dev client (`npm run dev`, then open the printed
   `http://localhost:5173/dune-clone/`) and click **MULTIPLAYER**.
3. **Connect to the same room:**
   - **Host** enters the relay URL `ws://localhost:8787` and a shared **room code** (e.g. `dune`),
     then **Connect** — whoever joins an empty room first is the host.
   - **Joiner** enters `ws://<host-machine-IP>:8787` and the **same room code**, then **Connect**.
4. Each player picks their **House**; the host picks the **difficulty**. Both click **READY**, then
   the host clicks **START**. Win/lose returns both players to the title.

> **Note:** play multiplayer from a **local** client (`npm run dev`, served over `http://`). The
> public GitHub Pages build is served over `https://`, and browsers block an insecure `ws://`
> connection from an `https://` page (mixed content). A `wss://` (TLS) relay for internet play is a
> future enhancement; v1 targets LAN / host-reachable play. Pause and quick-save are disabled
> during a multiplayer match.

## Controls

| Action | Input |
|---|---|
| Select | left-click / left-drag a box |
| Move / Attack / Harvest | right-click |
| Pan camera | arrow keys · screen edge · minimap |
| Build a structure | sidebar icon, then click the map to place |
| Train a unit | sidebar unit icon |
| **Cancel one queued build** | **right-click its sidebar icon (refunds)** |
| Buy an upgrade | sidebar upgrade icon (once a Radar is built) |
| Attack-move / Stop / Hold / Guard | `A` (then click) / `S` / `H` / `G` (or the command bar) |
| Set a rally point | select a producer (no units selected), then right-click a spot |
| Control groups | `Shift`+`1`–`9` assign · digit selects · double-tap to centre |
| Toggle building self-repair | `R` (select a damaged building) |
| Centre on base / Cancel · Pause | `Space` / `Esc` · `P` |
| Quick save / load (single-player) | `Ctrl+S` / `Ctrl+L` |
| Mute audio | `M` (or the top-bar speaker) |

## Project layout

```
src/
  core/      loop · input · camera · A* pathfinding · procedural audio
  world/     world (orchestrator) · defs (data-driven stats) · units · buildings ·
             projectiles · player economy · tilemap · fog · enemy AI · constants
  render/    canvas renderer (building sprites + explosion FX) · sidebar/minimap/HUD UI
  game/      controller (input→commands, mission flow) · mission definitions
  net/       multiplayer: wire protocol · WebSocket transport · lobby (DOM overlay) ·
             lockstep session · command-apply layer  (additive; off in single-player)
server/
  relay.ts   standalone Node `ws` relay (npm run relay) — never bundled into the client
scripts/
  sim.ts     headless balance harness        (npm run sim)
  nettest.ts headless 2-client lockstep check (npm run nettest)
assets/
  sprites/   building-<id>.png art (auto-discovered) + fx-explosion.png + *.md art specs
```

## How it was built

Built iteratively with **Claude Code**, including multi-agent workflows (specialist
design / implementation / verification agents) for features like the rally points, the
balance-and-difficulty pass, and the **non-invasive multiplayer layer** (deterministic lockstep +
host-snapshot sync, added on top of the existing engine without changing its single-player game
logic). Every change is verified by type-checking, a production build, the headless balance
simulation, and — for multiplayer — a headless two-client determinism cross-check (`npm run nettest`).
