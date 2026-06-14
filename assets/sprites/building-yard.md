# Building Sprite Spec — Construction Yard (`yard`)

## Basic Facts

| Property       | Value                               |
|----------------|-------------------------------------|
| ID             | `yard`                              |
| In-game name   | Construction Yard                   |
| Footprint      | 3 × 3 tiles                        |
| **Sprite size**| **96 × 96 px** (3×32 × 3×32)       |
| Author at      | 384 × 384 px, downscale to 96 × 96 |
| Base colour    | `#5b6b7a` (steel-blue grey)         |
| Trim colour    | `#39434d` (dark slate)              |

## What This Building Is

The Construction Yard is the player's command hub — the first and most critical building on
the map. It is a large, fortress-like industrial complex that supervises all new
construction. Losing it ends the game.

## How It Should Read from Directly Above

A sprawling compound with a heavy outer wall or berm rendered in the base steel-blue grey.
The interior should show a large open staging area or crane arm (suggesting assembly
operations), plus modular structures: a central command tower, storage bays, and vehicle
access ramps. Metal hatches, ventilation grilles, and stencilled hazard markings reinforce
the industrial-military read. The overall silhouette should feel dense and fortified — the
biggest, most complex footprint on the map.

A subtle top-left directional highlight on raised elements (tower top, crane arm) is fine.

## Required Frames

| Frame | Name          | Required |
|-------|---------------|----------|
| 0     | `normal`      | Yes      |
| 1     | `constructing`| Optional |
| 2     | `damaged`     | Optional |

## Engine Overlays (do NOT bake these in)

The engine draws on top: owner-coloured border (2 px inset), HP bar above, white selection
outline. Keep a ~2 px transparent margin around all structure art. No team colour, no health
bar, no selection ring in the sprite.

---

## Ready-to-Paste Image-Generation Prompt

```
Top-down orthographic sprite for a desert-military RTS game, viewed directly overhead (camera
pointing straight down — NO isometric angle, NO 3/4 perspective, NO foreshortening). The image
must look exactly as if you are staring down at a table-top model from above.

Subject: Construction Yard — a large industrial command compound, 96 × 96 pixels final size.
The image canvas is exactly 96 × 96 px, transparent background (PNG with alpha). There is a
clean 2-pixel transparent margin on all edges; no structure detail extends into this margin.

Palette: dominant base colour #5b6b7a (steel-blue weathered metal/concrete), trim and shadow
details in #39434d (dark slate). Accent neutrals from desert context: dusty sand #c2a058,
grime shadow #6b5d44. No team colours, no faction insignia.

Style: Dune/desert-military industrial. Sand-blasted metal panels, riveted walls, sparse
stencilled markings, heat-bleached concrete berm. Muted, desaturated palette. Readable at
small scale — avoid fine lines thinner than 2 px at final resolution.

Structure details visible from overhead: heavy outer perimeter wall or earthwork berm in
base colour; a central modular command tower (raised, highlighted top-left); a large open
staging/assembly area with crane arm or gantry suggestion; vehicle access ramp slots at
edges; ventilation grilles and metal hatch rectangles on flat roof sections.

No health bars, no selection rings, no glowing effects, no team-colour tinting. Transparent
background. Export at 384 × 384 px (4× supersample), to be downscaled to 96 × 96 px.
```
