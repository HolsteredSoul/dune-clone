# Building Sprite Spec — War Factory (`factory`)

## Basic Facts

| Property       | Value                                 |
|----------------|---------------------------------------|
| ID             | `factory`                             |
| In-game name   | War Factory                           |
| Footprint      | 3 × 2 tiles                          |
| **Sprite size**| **96 × 64 px** (3×32 × 2×32)         |
| Author at      | 384 × 256 px, downscale to 96 × 64   |
| Base colour    | `#75707a` (cool grey-purple)          |
| Trim colour    | `#45424d` (dark grey-purple)          |

## What This Building Is

The War Factory produces all vehicles: Harvester, Recon Buggy, Battle Tank, and Artillery.
It requires the Radar Outpost and costs 700 credits. It is a wide, heavy-industry structure
— the vehicle assembly and deployment centre of the base.

## How It Should Read from Directly Above

A wide (3:2 aspect) heavy-industry plant in cool grey-purple. The roof shows a large central
assembly bay — a wide open floor area with painted guide-lines or track markings where
vehicles are built. A large sliding door or roll-up gate is visible on one long side (where
finished vehicles exit). The perimeter has dark-trim structural frame members and modular
equipment boxes along the walls. One area suggests a crane or gantry overhead structure
(seen as a beam shape from above). Vehicle-scale space is clearly implied.

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

Subject: War Factory — a wide desert military heavy-vehicle assembly plant, 96 × 64 pixels
final. The image canvas is exactly 96 × 64 px, transparent background (PNG with alpha). Clean
2-pixel transparent margin on all edges; no structure detail enters the margin.

Palette: dominant base colour #75707a (cool grey-purple weathered metal), trim and structural
frame in #45424d (dark grey-purple). Environmental neutrals: sand #c2a058, grime #6b5d44.
No team colours, no faction insignia.

Style: Dune/desert-military. Wide, heavy-industry vehicle factory. Riveted steel panels,
track markings, industrial equipment. Muted, desaturated palette. All details readable at
96 × 64 px final — no lines thinner than 2 px at final resolution.

Structure details visible from overhead: the building is wider than it is deep (3:2 ratio);
one long edge has a wide sliding or roll-up vehicle exit door; the main roof shows a large
open assembly bay floor with painted guide-lines or tyre-track markings; perimeter shows
dark-trim structural I-beam frames; one area has a gantry or crane beam outline across the
bay; modular equipment boxes clustered along one wall.

No health bars, no selection rings, no glowing effects, no team-colour tinting. Transparent
background. Export at 384 × 256 px (4× supersample), to be downscaled to 96 × 64 px.
```
