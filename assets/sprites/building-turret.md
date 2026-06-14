# Building Sprite Spec — Gun Turret (`turret`)

## Basic Facts

| Property       | Value                                  |
|----------------|----------------------------------------|
| ID             | `turret`                               |
| In-game name   | Gun Turret                             |
| Footprint      | 1 × 1 tile                            |
| **Sprite size**| **32 × 32 px** (1×32 × 1×32)          |
| Author at      | 128 × 128 px, downscale to 32 × 32    |
| Base colour    | `#6b6b75` (cool grey)                 |
| Trim colour    | `#3d3d45` (dark charcoal-purple grey)  |

## What This Building Is

The Gun Turret is the primary defensive structure. It fires a cannon at ground and air
targets (range 170 px, damage 26, with `canTargetAir: true`). It is the smallest building
on the map — a single 1×1 tile — and must read instantly as a weapon emplacement even at
32 × 32 px.

**Important engine note:** The engine already draws a dark circular turret base (`#2a2a30`,
radius 28% of min dimension) over the centre of this sprite in `drawBuilding()`. The sprite
should therefore represent the hardened gun emplacement pad itself (the concrete/metal
foundation plate), NOT the rotating barrel — the engine's procedural dark circle will serve
as the turret head. Keep the centre of the sprite relatively clear so the engine's circle is
legible on top.

## How It Should Read from Directly Above

A small, heavily armoured circular or octagonal gun pad in cool grey. The perimeter shows
armoured plating with bolts or welds. The interior (centre region) is kept in a slightly
darker tone so the engine's dark turret-head circle can overlay it clearly. A faint crosshair
or targeting reticle scratched into the pad surface is acceptable. Sandbag or armour-plate
detail around the edge reinforces the defensive emplacement read.

## Required Frames

| Frame | Name          | Required |
|-------|---------------|----------|
| 0     | `normal`      | Yes      |
| 1     | `constructing`| Optional |
| 2     | `damaged`     | Optional |

## Engine Overlays (do NOT bake these in)

The engine draws: owner border (2 px inset), HP bar, white selection outline, AND a dark
circle (`#2a2a30`, radius ~9 px at final scale) as the turret head over the sprite centre,
AND a yellow muzzle flash circle when firing. Keep the sprite centre region clear and ~2 px
margin around edges. No team colour, no barrel art, no health bar, no muzzle flash in sprite.

---

## Ready-to-Paste Image-Generation Prompt

```
Top-down orthographic sprite for a desert-military RTS game, viewed directly overhead (camera
pointing straight down — NO isometric angle, NO 3/4 perspective, NO foreshortening). The image
must look exactly as if you are staring down at a table-top model from above.

Subject: Gun Turret — a small desert military defensive gun emplacement pad, 32 × 32 pixels
final. The image canvas is exactly 32 × 32 px, transparent background (PNG with alpha). Clean
2-pixel transparent margin on all edges; no structure detail enters the margin.

CRITICAL: The centre of the sprite (roughly a circle of radius 9 px centred in the 32 × 32
canvas) must be kept as a clear, dark neutral area (#2a2a30 or similar very dark charcoal).
The game engine will draw a rotating turret barrel assembly on top of this region. Do NOT paint
any barrel, gun, or rotating element in the sprite itself.

Palette: base colour #6b6b75 (cool weathered grey metal/concrete), armour trim and shadow
details in #3d3d45 (dark charcoal-purple). Neutrals: sand dust #c2a058. No team colours.

Style: Dune/desert-military. Compact, heavily armoured gun pad. Armour plate welds, bolt
details, sandbag or blast-wall suggestion at perimeter. Muted, desaturated. Everything readable
at 32 × 32 px — this is the smallest building, so maximum simplicity and contrast.

Structure details visible from overhead: circular or octagonal armoured pad with plated
perimeter and bolted seams; clear dark centre area for the engine's turret head; optional
faint scratched targeting crosshair or reticle on the pad surface.

No health bars, no selection rings, no glowing effects, no barrel art, no team-colour tinting.
Transparent background. Export at 128 × 128 px (4× supersample), to be downscaled to 32 × 32 px.
```
