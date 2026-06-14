# Building Sprite Spec — Barracks (`barracks`)

## Basic Facts

| Property       | Value                               |
|----------------|-------------------------------------|
| ID             | `barracks`                          |
| In-game name   | Barracks                            |
| Footprint      | 2 × 2 tiles                        |
| **Sprite size**| **64 × 64 px** (2×32 × 2×32)       |
| Author at      | 256 × 256 px, downscale to 64 × 64 |
| Base colour    | `#7a5b4a` (warm brown-rust)         |
| Trim colour    | `#4d392f` (dark reddish brown)      |

## What This Building Is

The Barracks trains infantry: Light Infantry and Rocket Troopers. It is a standard military
housing and training facility. The building should immediately read as a place where soldiers
are prepared and deployed — a military barracks on a desert world.

## How It Should Read from Directly Above

A compact military compound in warm brown-rust tones. The rooftop shows a rectangular
training or muster area with a dark-trim perimeter. A small entry door/gate is visible on
one edge (where units exit). Two or three barrack hut outlines or a long bunk-block
structure fill the interior. Possible details: a tiny weapons rack or gear storage shape,
stencilled numbers or markings on the roof, ventilation slats along the edge walls.
The silhouette should be blocky and rectilinear — military precision.

## Required Frames

| Frame | Name          | Required |
|-------|---------------|----------|
| 0     | `normal`      | Yes      |
| 1     | `constructing`| Optional |
| 2     | `damaged`     | Optional |

## Engine Overlays (do NOT bake these in)

Owner border (2 px inset), HP bar, selection outline are drawn by the engine on top.
Keep a ~2 px transparent margin. No team colour, no health bar in sprite.

---

## Ready-to-Paste Image-Generation Prompt

```
Top-down orthographic sprite for a desert-military RTS game, viewed directly overhead (camera
pointing straight down — NO isometric angle, NO 3/4 perspective, NO foreshortening). The image
must look exactly as if you are staring down at a table-top model from above.

Subject: Barracks — a desert military infantry training compound, 64 × 64 pixels final.
The image canvas is exactly 64 × 64 px, transparent background (PNG with alpha). Clean 2-pixel
transparent margin on all edges; no structure detail enters the margin.

Palette: dominant base colour #7a5b4a (warm brown-rust weathered concrete/metal), trim and
shadow details in #4d392f (dark reddish brown). Environmental neutrals: sand #c2a058, grime
#6b5d44. No team colours, no faction insignia.

Style: Dune/desert-military. Blocky, rectilinear military compound. Sparse stencilled
markings, sand-blasted walls, riveted panels. Muted palette, readable at 64 × 64 px final.
No fine lines thinner than 2 px at final resolution.

Structure details visible from overhead: square compound with dark-trim perimeter walls; two
or three long rectangular bunk/hut block outlines inside; a small gate or door opening on
one edge where troops exit; possible ventilation slat rows along wall edges; faint stencil
number or chevron marking on the roof.

No health bars, no selection rings, no glowing effects, no team-colour tinting. Transparent
background. Export at 256 × 256 px (4× supersample), to be downscaled to 64 × 64 px.
```
