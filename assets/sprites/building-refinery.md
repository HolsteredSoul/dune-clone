# Building Sprite Spec — Spice Refinery (`refinery`)

## Basic Facts

| Property       | Value                                 |
|----------------|---------------------------------------|
| ID             | `refinery`                            |
| In-game name   | Spice Refinery                        |
| Footprint      | 3 × 2 tiles                          |
| **Sprite size**| **96 × 64 px** (3×32 × 2×32)         |
| Author at      | 384 × 256 px, downscale to 96 × 64   |
| Base colour    | `#7a6a4a` (warm tan/khaki metal)      |
| Trim colour    | `#4d422f` (dark brown)                |

## What This Building Is

The Spice Refinery processes raw spice delivered by harvesters, converting it into credits.
It is the economic heart of the base. It is wider than it is tall (3 × 2), which should
read as a wide processing facility with a distinct intake side (where harvesters dock) and
an output/storage side.

## How It Should Read from Directly Above

A wide, low industrial processing plant in warm tan/khaki. The intake end (one short side)
shows a wide vehicle bay or loading dock where the harvester would drive in. The main body
has large processing vats or refinery columns visible from above as circular or hexagonal
shapes in the trim brown. A pipe network connects the vats to a storage silo on the
opposite end. Orange-tinged spice dust or residue texturing (`#d8742a` at low opacity) on
the floor of the processing area reinforces the Dune aesthetic.

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

Subject: Spice Refinery — a wide desert industrial processing plant, 96 × 64 pixels final.
The image canvas is exactly 96 × 64 px, transparent background (PNG with alpha). Clean 2-pixel
transparent margin on all edges; no structure detail enters the margin.

Palette: dominant base colour #7a6a4a (warm tan/khaki weathered metal), trim and structure
details in #4d422f (dark brown). Accent: spice-orange tint #d8742a as a low-opacity dust or
residue texture on the processing floor. Neutrals: sand #c2a058, grime #6b5d44. No team colours,
no faction insignia.

Style: Dune/desert-military industrial. Wide, low-profile processing facility. Sand-blasted
panels, rivets, functional pipe layouts. Muted palette. All details readable at 96 × 64 px —
no lines thinner than 2 px at final resolution.

Structure details visible from overhead: the building is wider than it is deep (3:2 ratio);
one short end has a wide vehicle bay/loading dock (where harvesters dock); the main body shows
2–3 large circular or hexagonal processing vat outlines in dark-brown trim; a pipe network
connects vats to a rectangular storage silo on the opposite short end; a faint spice-orange
dust texture on the interior floor.

No health bars, no selection rings, no glowing effects, no team-colour tinting. Transparent
background. Export at 384 × 256 px (4× supersample), to be downscaled to 96 × 64 px.
```
