# Dune Clone — a browser RTS

A real-time strategy game in the spirit of **Dune II / Command & Conquer**, written from
scratch in **TypeScript + HTML5 Canvas** (no game engine), bundled with Vite.

Harvest spice → bank credits → raise a base from your Construction Yard → manage power and
tech tiers → build infantry, vehicles, and aircraft → command them in continuous real-time
combat across a 3-mission campaign.

## Features

- **Economy** — harvesters mine spice and return it to a refinery for credits; spice fields
  deplete.
- **Base building** — Construction Yard build menu, ghost placement, power balance (low power
  slows production), and a tech tree (Power → Refinery/Barracks → Radar → Factory → Helipad).
- **Units** — Light Infantry, Harvester, Battle Tank, and Ornithopter aircraft, produced at
  their facilities via power-scaled queues, with optional **rally points**.
- **Real-time command** — box/click selection, A* pathfinding, attack-move, hold, guard, stop,
  and four **stances** (Aggressive / Guard / Hold-Ground / Hold-Fire). Units retaliate while
  moving and re-acquire targets after a kill.
- **Enemy AI** — economy build-order, unit training, and capped attack waves.
- **Campaign** — 3 missions with fog of war, briefings, and a win/lose loop.
- **Difficulty** — Easy / Normal / Hard, selectable on the brief screen.
- **Balance, measured** — a headless simulation harness (`npm run sim`) pits a scripted player
  bot against the AI across every mission × difficulty. Tuned ladder (player win-rate):
  Easy 100% · Normal ~60% · Hard ~30%, with no sub-90-second stomps and a passive player
  losing every time.

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
| Attack-move / Stop / Hold / Guard | `A` (then click) / `S` / `H` / `G` (or the command bar) |
| Set a rally point | select a producer (no units selected), then right-click a spot |
| Centre on base / Cancel | `Space` / `Esc` |

## Project layout

```
src/
  core/      loop · input · camera · A* pathfinding
  world/     world (orchestrator) · defs (data-driven stats) · units · buildings ·
             projectiles · player economy · tilemap · fog · enemy AI · constants
  render/    canvas renderer · sidebar/minimap/HUD UI
  game/      controller (input→commands, mission flow) · mission definitions
scripts/
  sim.ts     headless balance harness
```

## How it was built

Built iteratively with **Claude Code**, including a multi-agent workflow (specialist
design / implementation / verification agents) for the rally-point feature and the
balance-and-difficulty pass, with every change verified by type-checking, a production build,
and the headless simulation harness above.
