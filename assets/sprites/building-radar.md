# Building Sprite Spec — Radar Outpost (`radar`)

## Basic Facts

| Property       | Value                               |
|----------------|-------------------------------------|
| ID             | `radar`                             |
| In-game name   | Radar Outpost                       |
| Footprint      | 2 × 2 tiles                        |
| **Sprite size**| **64 × 64 px** (2×32 × 2×32)       |
| Author at      | 256 × 256 px, downscale to 64 × 64 |
| Base colour    | `#4a6a7a` (muted teal-blue)         |
| Trim colour    | `#2f424d` (dark blue-grey)          |

## What This Building Is

The Radar Outpost provides long-range vision (9-tile sight radius — the largest of any
building) and unlocks the upgrades panel. It is the tech building of the base. In-game it
costs 500 credits, requires the Spice Refinery, and consumes 40 power.

## How It Should Read from Directly Above

A compact technical structure dominated by a large circular radar dish or rotating antenna
array seen from directly above. The dish shape (viewed top-down) appears as a circle or
concentric ring set into the roof of the outpost. The base structure in teal-blue has a
square equipment room footprint below the dish, with cable conduits or equipment racks
visible at the edges. Possible: a small secondary dish or radio mast stub. The overall read
is "communications/surveillance tech" — more angular and precise than the barracks, with
electronic equipment clusters.

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

Subject: Radar Outpost — a desert military surveillance and communications station,
64 × 64 pixels final. The image canvas is exactly 64 × 64 px, transparent background
(PNG with alpha). Clean 2-pixel transparent margin on all edges; no structure detail enters
the margin.

Palette: dominant base colour #4a6a7a (muted teal-blue metal), trim and equipment details
in #2f424d (dark blue-grey). Neutrals: sand #c2a058, grime #6b5d44. No team colours, no
faction insignia.

Style: Dune/desert-military. Technical surveillance structure. Angular, precise, with
electronic equipment clusters. Muted, desaturated palette. All details readable at 64 × 64
px final — no lines thinner than 2 px at final resolution.

Structure details visible from overhead: a large circular radar dish or concentric ring
antenna array centred on the roof (the dominant visual element when viewed from above);
a square equipment-room base below the dish in teal-blue; cable conduit lines radiating
from the dish mount to the edges; a small secondary dish or radio mast stub in one corner.

No health bars, no selection rings, no glowing effects, no team-colour tinting, no
animated sweep. Transparent background. Export at 256 × 256 px (4× supersample), to be
downscaled to 64 × 64 px.
```
