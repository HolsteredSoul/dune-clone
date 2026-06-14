# Sprite Guide — Dune_Clone Art Assets

## 1. View Conventions

**This game uses a strict top-down orthographic view. Every sprite must be painted as if the
camera is directly overhead, pointing straight down. There is no isometric angle, no 3/4
perspective, no foreshortening, and no drop shadows that imply a side view.**

A subtle top-left directional highlight on raised surfaces (hatches, vents, antennae) is
acceptable and gives slight depth without breaking the overhead read.

---

## 2. Pixel Dimensions

### Formula

```
sprite width  = building.w * TILE   (pixels)
sprite height = building.h * TILE   (pixels)
```

`TILE = 32 px` (the engine's pixels-per-tile at zoom 1, from `src/world/constants.ts`).

### Building pixel sizes

| Building ID | Name                | Footprint (tiles) | Sprite size (px) |
|-------------|---------------------|-------------------|------------------|
| `yard`      | Construction Yard   | 3 × 3             | 96 × 96          |
| `power`     | Power Plant         | 2 × 2             | 64 × 64          |
| `refinery`  | Spice Refinery      | 3 × 2             | 96 × 64          |
| `barracks`  | Barracks            | 2 × 2             | 64 × 64          |
| `radar`     | Radar Outpost       | 2 × 2             | 64 × 64          |
| `turret`    | Gun Turret          | 1 × 1             | 32 × 32          |
| `factory`   | War Factory         | 3 × 2             | 96 × 64          |
| `helipad`   | Helipad             | 2 × 2             | 64 × 64          |

---

## 3. File Format

- **Format:** PNG with a fully transparent background (alpha channel required).
- **Authoring resolution (supersample):** Work at **4× the final size**, then export
  downscaled to the final px dimensions listed above. This produces crisp pixel edges.

  Example: Gun Turret (32 × 32 final) → author at 128 × 128, downscale on export.

- **Colour profile:** sRGB.
- **No compression artefacts** around transparent edges (use PNG, not JPEG).

---

## 4. Aesthetic

**Desert-military industrial.** Sand-blasted metal, heat-bleached concrete, sparse
stencilled markings, utilitarian silhouettes. High readability at small scale is paramount —
avoid fine detail that vanishes at 32–96 px.

### Shared palette (extracted from `src/world/defs.ts`)

These are the base and trim colours used by the engine's procedural drawing code. Use
them as the dominant hues in each building's sprite so the generated art coheres with the
engine placeholder art while looking far richer.

| Building   | Base colour | Trim colour |
|------------|-------------|-------------|
| yard       | `#5b6b7a`   | `#39434d`   |
| power      | `#4a7a5b`   | `#2f4d39`   |
| refinery   | `#7a6a4a`   | `#4d422f`   |
| barracks   | `#7a5b4a`   | `#4d392f`   |
| radar      | `#4a6a7a`   | `#2f424d`   |
| turret     | `#6b6b75`   | `#3d3d45`   |
| factory    | `#75707a`   | `#45424d`   |
| helipad    | `#5a5a8a`   | `#39395a`   |

Shared environmental accent colours:
- Desert sand: `#c2a058` / `#b89550`
- Rock/dust: `#6b5d44`
- Spice orange: `#d8742a`

---

## 5. Engine Overlays — What the Engine Draws for You

The renderer (`src/render/renderer.ts`, `drawBuilding()`) already draws the following on
top of whatever sprite is rendered:

- **Owner border** — a 2 px coloured stroke (`#46d46e` for player, `#e0524a` for enemy)
  inset 1 px from the sprite edge.
- **HP bar** — a 3 px tall bar drawn 5 px above the sprite's top edge.
- **Muzzle flash** — a yellow glow circle drawn over the sprite centre for turrets.
- **Selection outline** — a 1 px white `strokeRect` drawn 1 px outside the sprite edge.

**Sprites must therefore:**
1. Keep a clean, transparent ~2 px margin around the outermost edge of structure art so
   the owner border is clearly visible against it.
2. NOT bake in any team-colour tinting — all sprites are faction-neutral.
3. NOT include health bars, selection rings, or muzzle flash glows.

### Optional: tintable team-colour accent region

If you later want sprites that respond to tinting (e.g. a canvas `globalCompositeOperation`
pass), you can reserve a small region (a band, stripe, or panel) on each building in a
desaturated neutral grey (`#808080`). A multiply-blend pass can then tint it to player or
enemy colour. **This is optional.** The current engine does not do this; the plain
faction-neutral sprite is fully correct for the current codebase.

---

## 6. Sprite-Sheet / Sprite-Map Layout

Each building uses a **horizontal strip** of frames in a single PNG.

### Frames (in order, left to right)

| Frame index | Name          | Description                                                    | Required? |
|-------------|---------------|----------------------------------------------------------------|-----------|
| 0           | `normal`      | Fully built, operating structure                               | Required  |
| 1           | `constructing`| Mid-construction (scaffolding, partial walls, dirt foundation) | Optional  |
| 2           | `damaged`     | Heavy damage state (~25 % HP): cracked panels, scorch marks   | Optional  |

- **Frame size:** exactly the building's final px dimensions (e.g. 96 × 64 for the factory).
- **Padding between frames:** 0 px (tight strip). If your tool requires padding, use 1 px
  transparent gap but document it.
- **Sheet width:** `frame_count × sprite_width`. Sheet height equals sprite height.
- **Anchor / origin:** top-left corner of each frame corresponds to tile coordinate
  `(building.tx, building.ty)` in world space — same as the engine's `sx, sy` origin.

### File-naming convention

```
building-<id>.png          ← single-frame (normal only)
building-<id>-sheet.png    ← multi-frame strip (normal + optional constructing/damaged)
```

Examples:
```
building-yard.png
building-factory-sheet.png
```

Place all files in `assets/sprites/`.

---

## 7. Units Note

See `units-sprites-note.md` in this folder.

---

## 8. Effects Sheets (`fx-*.png`)

Effect animation sheets (explosions, etc.) follow a different layout rule from building sprites:

- **Square frames in a horizontal strip, zero padding.**
  The engine infers `frameCount = imageWidth / imageHeight` and `frameSize = imageHeight`.
  Frames **must** be square and the sheet width **must** be an exact integer multiple of the
  sheet height. Any padding breaks the calculation.
- **Auto-discovered:** any `assets/sprites/fx-*.png` file is picked up automatically by the
  renderer — no source-code change is needed to activate a new sheet.
- **Plays once** over the effect's lifetime (1.2 s for explosions), advancing one frame per
  `lifetime / frameCount` seconds.
- **Transparent background** (PNG with alpha), top-down orthographic view, sRGB — same
  baseline rules as building sprites.

See `fx-explosion.md` in this folder for the full explosion/destruction sprite spec,
including exact pixel dimensions, palette, frame-by-frame visual progression, and a
ready-to-paste image-generation prompt.
