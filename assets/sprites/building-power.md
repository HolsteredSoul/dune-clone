# Building Sprite Spec — Power Plant (`power`)

## Basic Facts

| Property       | Value                               |
|----------------|-------------------------------------|
| ID             | `power`                             |
| In-game name   | Power Plant                         |
| Footprint      | 2 × 2 tiles                        |
| **Sprite size**| **64 × 64 px** (2×32 × 2×32)       |
| Author at      | 256 × 256 px, downscale to 64 × 64 |
| Base colour    | `#4a7a5b` (muted olive-green)       |
| Trim colour    | `#2f4d39` (deep forest green)       |

## What This Building Is

The Power Plant generates electricity for all other structures. It is an early-game
prerequisite — nothing else unlocks without it. It is compact, functional, and must be
recognisable immediately as an energy-generation structure.

## How It Should Read from Directly Above

A square industrial plant with a boxy reactor or generator core at the centre, rendered in
the olive-green base colour. The trim dark-green frames cable conduits, coolant pipes, or a
perimeter heat-sink grid running around the edge of the roof. Subtle radiating or concentric
details suggest energy output. A small exhaust or intake vent cluster visible on one side.
A faint hot-glow suggestion (pale yellow-white `#ffe8a0`) at the very centre of the reactor
top is acceptable as a surface texture detail, but must not look like a muzzle flash or
animated effect.

## Required Frames

| Frame | Name          | Required |
|-------|---------------|----------|
| 0     | `normal`      | Yes      |
| 1     | `constructing`| Optional |
| 2     | `damaged`     | Optional |

## Engine Overlays (do NOT bake these in)

Owner border (2 px inset), HP bar, selection outline are all drawn by the engine on top.
Keep a ~2 px transparent margin. No team colour, no health bar in sprite.

---

## Ready-to-Paste Image-Generation Prompt

```
Top-down orthographic sprite for a desert-military RTS game, viewed directly overhead (camera
pointing straight down — NO isometric angle, NO 3/4 perspective, NO foreshortening). The image
must look exactly as if you are staring down at a table-top model from above.

Subject: Power Plant — a compact desert military electricity generator, 64 × 64 pixels final.
The image canvas is exactly 64 × 64 px, transparent background (PNG with alpha). Clean 2-pixel
transparent margin on all edges; no structure detail enters the margin.

Palette: dominant base colour #4a7a5b (muted olive-green weathered metal), trim and pipes in
#2f4d39 (deep forest green). Accent: pale exhaust glow texture #ffe8a0 at reactor centre
(static surface detail only — not a glowing effect). Dusty neutrals #c2a058, grime #6b5d44.
No team colours, no faction insignia.

Style: Dune/desert-military industrial. Riveted panels, heat-bleached paint, sparse stencilling.
Muted, desaturated palette. All details readable at 64 × 64 px final — no lines thinner than
2 px at final resolution.

Structure details visible from overhead: square boxy reactor/generator core at centre; dark-green
framed conduit or coolant-pipe grid around the roof perimeter; small exhaust or intake vent
cluster on one edge; faint concentric ring or radiating line detail suggesting energy output
around the core.

No health bars, no selection rings, no animated glows, no team-colour tinting. Transparent
background. Export at 256 × 256 px (4× supersample), to be downscaled to 64 × 64 px.
```
