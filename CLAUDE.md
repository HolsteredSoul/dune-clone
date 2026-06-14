# Dune_Clone — agent index

**Read `PROJECT_MEMORY.md` first.** It is the single source of truth for this project:
goal, status, architecture decisions, the module roadmap, open tasks, risks, and the
verification checklist. Update it at the end of any session that changes things.

This file is a thin router only. Do not restate project knowledge here — it lives in
`PROJECT_MEMORY.md`.

## Stack
TypeScript + HTML5 Canvas, bundled with Vite. No game engine.

## Run
- `npm install` — once.
- `npm run dev` — start the dev server (hot reload) and open the printed URL.
- `npm run build` — type-check + production build to `dist/`.
- `npm run sim` — headless balance harness: bot-vs-AI matches across missions × difficulties,
  prints win-rates/durations. Source: `scripts/sim.ts` (bundled via the local esbuild).

## Code map (entry points only)
| Concern | File |
|---|---|
| HTML host + canvas | `index.html` |
| Bootstrap / wire-up | `src/main.ts` |
| Controller (input→commands, mission flow) | `src/game/game.ts` |
| Mission definitions (3, escalating) | `src/game/missions.ts` |
| Fixed-timestep loop | `src/core/loop.ts` |
| Input (keys/mouse, event queue) | `src/core/input.ts` |
| Camera / viewport | `src/core/camera.ts` |
| Grid A* pathfinding | `src/core/astar.ts` |
| Building + unit data defs (stats/costs/tech) | `src/world/defs.ts` |
| Sim orchestrator (economy/combat/win-lose) | `src/world/world.ts` |
| Enemy AI | `src/world/ai.ts` |
| Per-faction economy + production queues | `src/world/player.ts` |
| Building / Unit / Projectile entities | `src/world/{building,unit,projectile}.ts` |
| Difficulty table (Easy/Normal/Hard mods) | `src/world/defs.ts` (`DIFFICULTY`) |
| Headless balance harness | `scripts/sim.ts` |
| Tile map + terrain + spice | `src/world/tilemap.ts` |
| Fog of war | `src/world/fog.ts` |
| Tunable constants | `src/world/constants.ts` |
| World rendering | `src/render/renderer.ts` |
| Sidebar / minimap / HUD / overlays | `src/render/ui.ts` |

## Controls
Left-drag/click select · right-click move/attack/harvest · sidebar builds structures (click,
then click map to place) & queues units (**right-click a sidebar icon to cancel one — refunds**;
multiple Barracks/War Factories build in parallel) · minimap to jump · **arrows/edge/minimap pan** (WASD
freed for commands). Unit commands (selection): `A` attack-move · `S` stop · `H` hold · `G`
guard · or use the on-screen command bar (incl. stance: Aggressive/Guard/Hold-Ground/Hold-Fire).
**Rally points:** select a friendly producer (yard/barracks/factory/helipad) with no units
selected, then right-click to set where its new units gather (right-click the building to clear).
**Difficulty:** pick Easy/Normal/Hard on the mission brief screen (persists for the session).
`Space` home · `Esc` cancel.

> Archived quant-project governance templates live in `archive/governance-template/`
> (not loaded; kept in case they're reused for a different project).
