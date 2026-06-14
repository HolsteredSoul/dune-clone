# Dune Clone — a browser RTS

A real-time strategy game in the spirit of **Dune II / Command & Conquer**, written from
scratch in **TypeScript + HTML5 Canvas** (no game engine), bundled with Vite.

Harvest spice → bank credits → raise a base from your Construction Yard → manage power and
tech tiers → build infantry, vehicles, and aircraft → command them in continuous real-time
combat across a 3-mission campaign.

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
- **Real-time command** — box/click selection, A* pathfinding, attack-move, hold, guard, stop,
  and four **stances** (Aggressive / Guard / Hold-Ground / Hold-Fire).
- **Enemy AI** — economy build-order, unit training (fields Rocket Troopers + Recon Buggies and
  buys an upgrade), and capped attack waves.
- **Campaign** — 3 escalating missions with fog of war, briefings, and a win/lose loop.
- **Difficulty** — Easy / Normal / Hard, selectable on the brief screen.
- **Presentation** — optional **building sprites** (drop a `building-<id>.png` into
  `assets/sprites/`, auto-discovered; procedural fallback otherwise), floating **name tags**, and
  **explosion FX** (a `fx-explosion.png` sprite-sheet if present, else a procedural blast with
  shockwave + debris). See `assets/sprites/*.md` for the art specs.
- **Balance, measured** — a headless simulation harness (`npm run sim`) pits a scripted player
  bot against the AI across every mission × difficulty. The campaign is tuned as a difficulty
  *ramp* (player win-rate, M1→M3): Easy ~100% · Normal ~60/45/45% · Hard ~75/50/25%, with no
  sub-90-second stomps and a passive player losing every time. (The bot under-states the later
  missions — it doesn't micro Artillery the way a human would.)

## Run

```bash
npm install
npm run dev      # dev server with hot reload — open the printed localhost URL
npm run build    # type-check + production build to dist/
npm run sim      # headless balance simulation (bot vs AI across the ladder)
```

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
| Centre on base / Cancel | `Space` / `Esc` |

## Project layout

```
src/
  core/      loop · input · camera · A* pathfinding
  world/     world (orchestrator) · defs (data-driven stats) · units · buildings ·
             projectiles · player economy · tilemap · fog · enemy AI · constants
  render/    canvas renderer (building sprites + explosion FX) · sidebar/minimap/HUD UI
  game/      controller (input→commands, mission flow) · mission definitions
scripts/
  sim.ts     headless balance harness
assets/
  sprites/   building-<id>.png art (auto-discovered) + fx-explosion.png + *.md art specs
```

## How it was built

Built iteratively with **Claude Code**, including a multi-agent workflow (specialist
design / implementation / verification agents) for the rally-point feature and the
balance-and-difficulty pass, with every change verified by type-checking, a production build,
and the headless simulation harness above.
