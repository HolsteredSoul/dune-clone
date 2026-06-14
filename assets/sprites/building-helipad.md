# Building Sprite Spec — Helipad (`helipad`)

## Basic Facts

| Property       | Value                               |
|----------------|-------------------------------------|
| ID             | `helipad`                           |
| In-game name   | Helipad                             |
| Footprint      | 2 × 2 tiles                        |
| **Sprite size**| **64 × 64 px** (2×32 × 2×32)       |
| Author at      | 256 × 256 px, downscale to 64 × 64 |
| Base colour    | `#5a5a8a` (muted indigo-grey)       |
| Trim colour    | `#39395a` (dark indigo)             |

## What This Building Is

The Helipad produces and houses Ornithopters (aircraft). It requires the War Factory and
costs 800 credits — the most expensive building. It is the only structure that enables air
power. The Ornithopter is a Dune-universe thopter: a fast, gun-armed flying unit.

## How It Should Read from Directly Above

A classic helipad landing pad shape viewed from directly above: a large circular or slightly
octagonal landing surface centred in the square footprint, rendered in indigo-grey. The
landing circle should be clearly marked with a bold painted "H" or target-circle markings in
a contrasting trim colour — this is the most recognisable helipad symbol worldwide and must
be legible even at 64 px. Around the pad: edge lighting stubs or windsock post positions,
a small service/fuel station box in one corner, and the perimeter in the same indigo-grey
base. The dark indigo trim frames the circle edge and corner equipment.

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

Subject: Helipad — a desert military aircraft landing and service pad, 64 × 64 pixels final.
The image canvas is exactly 64 × 64 px, transparent background (PNG with alpha). Clean 2-pixel
transparent margin on all edges; no structure detail enters the margin.

Palette: dominant base colour #5a5a8a (muted indigo-grey tarmac/metal), trim markings and
frame in #39395a (dark indigo). Marking paint accent: off-white or pale yellow-grey for the
landing circle and "H" symbol. Neutrals: sand #c2a058, grime #6b5d44. No team colours.

Style: Dune/desert-military. Aircraft landing platform. Functional, with clear aviation
markings. Muted, desaturated palette. All details readable at 64 × 64 px — no lines thinner
than 2 px at final resolution.

Structure details visible from overhead: large circular landing pad centred in the square
footprint, with a bold painted "H" or concentric target-circle in off-white or pale yellow
on the pad surface (must be legible at 64 × 64 px); dark indigo trim ring framing the circle
edge; small edge-lighting stub marks (short rectangles) around the circle perimeter; a small
fuel/service station box in one corner; perimeter pad area in base indigo-grey.

No health bars, no selection rings, no glowing effects, no team-colour tinting, no aircraft
silhouette baked in. Transparent background. Export at 256 × 256 px (4× supersample), to be
downscaled to 64 × 64 px.
```
