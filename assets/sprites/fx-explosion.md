# Effect Sprite Spec — Explosion / Destruction (`fx-explosion`)

## Basic Facts

| Property              | Value                                                        |
|-----------------------|--------------------------------------------------------------|
| Filename (base)       | `assets/sprites/fx-explosion.png`                           |
| Filename (large, opt) | `assets/sprites/fx-explosion-large.png`                     |
| Sheet dimensions      | **512 × 64 px** (base) / **1024 × 128 px** (large)         |
| Frame count           | **8 frames** in each sheet                                   |
| Frame size            | **64 × 64 px** (base) / **128 × 128 px** (large)           |
| Author at             | 4× supersample, downscale on export                         |
| Authoring size        | 2048 × 256 px → downscale to 512 × 64 (base)               |
| Background            | Fully transparent (PNG with alpha channel)                  |
| View                  | Top-down orthographic — camera pointing straight down       |
| Colour profile        | sRGB                                                         |
| Effect lifetime       | 1.2 s (`CORPSE_TTL` in `src/world/constants.ts`)            |
| Engine size (unit)    | 16 px radius                                                 |
| Engine size (building)| 36 px radius                                                 |

---

## CRITICAL: Square-Frame / Horizontal-Strip Rule

> **The engine infers frame dimensions from image geometry alone. Frames MUST be square
> and the sheet width MUST be an exact integer multiple of the sheet height.**
>
> `frameCount = imageWidth / imageHeight`
> `frameSize  = imageHeight`
>
> A 512 × 64 sheet → 8 frames, each 64 × 64 px.
> A 1024 × 128 sheet → 8 frames, each 128 × 128 px.
>
> There is NO padding between frames. Any padding pixel breaks the frame-count calculation.
> The strip is laid out LEFT-TO-RIGHT, frame 0 at the left edge.

---

## Auto-Discovery and Playback

The renderer auto-discovers any `assets/sprites/fx-*.png` file. No source-code change is
required to activate a new sheet — place the file and restart/rebuild.

- **Base sheet** (`fx-explosion.png`) is used for all explosions.
- **Large sheet** (`fx-explosion-large.png`) is preferred by the engine for building deaths
  (size = 36 px) when present; the base sheet is scaled up if the large sheet is absent.
- The animation plays **once** over the full 1.2 s effect lifetime, advancing one frame every
  `1.2 / frameCount` seconds (≈ 0.15 s per frame for 8 frames).
- The effect is **centered on the death point** of the dying entity.
- The engine scales the frame to fill the entity's effect radius:
  unit deaths use a small blast (~32 px diameter on screen at zoom 1);
  building deaths use a larger blast (~72 px diameter).

---

## Sheet Layout

### Base sheet: `fx-explosion.png` — 512 × 64 px

```
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│  F0  │  F1  │  F2  │  F3  │  F4  │  F5  │  F6  │  F7  │
│64×64 │64×64 │64×64 │64×64 │64×64 │64×64 │64×64 │64×64 │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
 ←————————————————— 512 px ————————————————→  height: 64 px
```

### Large sheet (optional): `fx-explosion-large.png` — 1024 × 128 px

Identical progression, identical frame count (8), double the pixel dimensions per frame.
Preferred by the engine for building deaths when present.

```
┌────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│   F0   │   F1   │   F2   │   F3   │   F4   │   F5   │   F6   │   F7   │
│128×128 │128×128 │128×128 │128×128 │128×128 │128×128 │128×128 │128×128 │
└────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘
 ←—————————————————————— 1024 px ——————————————————————→  height: 128 px
```

---

## Visual Progression — Frame by Frame

The explosion must read clearly from directly overhead as a top-down fireball column
collapsing into smoke. There is NO side view, NO diagonal, NO isometric angle.

| Frame | Time (approx) | Name            | Shape & Colour Description                                                                                         |
|-------|---------------|-----------------|---------------------------------------------------------------------------------------------------------------------|
| 0     | 0.00 s        | Flash           | Tight central disc, nearly fills the frame. Brilliant white-yellow core (`#fff5c8`). Near-full opacity.            |
| 1     | 0.15 s        | Ignition        | Core spreads outward, ring of bright orange-yellow (`#f0a020`) around white centre. Ragged petal edges.           |
| 2     | 0.30 s        | Peak fireball   | Maximum diameter. Hot orange (`#d8742a`) dominates. Irregular, lobular outline; inner white-yellow hotspot.       |
| 3     | 0.45 s        | Fireball expand | Still large. Orange-red (`#c04010`) replaces the outer ring. Inner orange core. Dark spots begin at edges.        |
| 4     | 0.60 s        | Smoke rolls in  | Diameter starts shrinking. Dark brownish-grey smoke (`#4a3830`) rolls over outer thirds. Orange core persists.    |
| 5     | 0.75 s        | Smoke dominant  | Smoke (`#3a2e28`) covers most of the disc. Small residual orange-red ember glow at centre.                        |
| 6     | 0.90 s        | Dissipating     | Smoke thinning, translucent dark grey (`#2a2420`, ~50 % opacity). Wisps trailing outward from the disc edge.      |
| 7     | 1.05 s        | Wisps           | Nearly transparent. Faint dark charcoal wisps (`#2a2420`, ~15–20 % opacity). Mostly empty frame. Fades to clear.  |

**Alpha ramp:** frames 0–2 are fully opaque (alpha ≈ 1.0). Frames 3–5 hold ~0.8–0.9. Frame 6 drops to ~0.5. Frame 7 drops to ~0.15–0.2. The final pixel of frame 7 should be completely clear, so the effect fades cleanly.

---

## Palette

| Swatch                   | Hex       | Usage                                    |
|--------------------------|-----------|------------------------------------------|
| White-yellow flash       | `#fff5c8` | Frame 0 core; frame 1 inner hotspot      |
| Bright orange-yellow     | `#f0a020` | Frames 1–2 mid-ring                      |
| Spice orange (game tone) | `#d8742a` | Frames 2–3 dominant; matches `C.spice`   |
| Deep orange-red          | `#c04010` | Frame 3–4 outer ring                     |
| Charred brown-grey       | `#4a3830` | Frame 4–5 smoke                          |
| Dark smoke               | `#3a2e28` | Frame 5–6 dominant smoke                 |
| Near-black charcoal      | `#2a2420` | Frame 6–7 wisps; matches smoke           |

These hues are grounded in the game's existing colours: `C.spice = '#d8742a'` and
`C.spiceRich = '#a8481a'` from `src/render/renderer.ts`; the smoke tones are darker
extensions of the existing `rock = '#6b5d44'` environmental accent.

---

## Art Rules (Summary)

1. **Top-down orthographic only.** The fireball is a radially-symmetric overhead disc, not a
   mushroom-cloud side profile. Viewed from straight above, a column of fire/smoke reads as
   expanding and shrinking concentric regions.
2. **Radially symmetric** with slight organic irregularity — ragged, lobular edges on the
   fireball frames; wispy, asymmetric tendrils on the smoke frames. Not a perfect circle.
3. **Transparent background** in every frame. The explosion art floats on alpha; the engine
   composites it over the terrain.
4. **No padding** between frames. Frame edges butt directly against each other.
5. **No UI elements** baked in — no score indicators, no health bars, no selection rings.
6. **sRGB colour profile.**
7. **Author at 4×** (2048 × 256 for base, 4096 × 512 for large), then downscale on export.

---

## Ready-to-Paste Image-Generation Prompt

### Base sheet (512 × 64 px, 8 frames)

```
Create a pixel-art / digital-painted sprite sheet for a top-down orthographic RTS explosion
effect. The entire image is exactly 512 pixels wide and 64 pixels tall, with a fully
transparent background (PNG with alpha channel, no white fill, no checkerboard — true alpha).

The sheet is a SINGLE HORIZONTAL ROW of 8 square frames, each frame exactly 64 × 64 pixels,
placed left-to-right with ZERO pixels of padding or gap between them. Frame 0 starts at pixel
x=0, frame 1 at x=64, frame 2 at x=128, … frame 7 at x=448.

The view is TOP-DOWN OVERHEAD (camera pointing straight down). The explosion is seen from
directly above as a radially expanding disc — NOT a side-view mushroom cloud, NOT isometric,
NOT 3/4 perspective. Imagine looking straight down at a burning circle on a flat surface.

Frame-by-frame progression (left to right):

Frame 0 (flash, ~0.00 s):
  Tight brilliant white-yellow disc (#fff5c8), nearly fills the 64×64 frame.
  Fully opaque. Ragged petal edges. No smoke yet.

Frame 1 (ignition, ~0.15 s):
  Core remains white-yellow (#fff5c8). An expanding ring of bright orange-yellow (#f0a020)
  surrounds it. Diameter slightly larger than frame 0. Fully opaque.

Frame 2 (peak fireball, ~0.30 s):
  Maximum diameter — the fireball nearly touches the frame edges. Hot orange (#d8742a)
  dominates with a small inner white-yellow hotspot. Irregular lobular outline. Fully opaque.

Frame 3 (fireball expand, ~0.45 s):
  Still large. Deep orange-red (#c04010) replaces the outer ring. Inner orange-yellow core.
  First hints of dark charred spots at outermost edges. Opacity ~0.85.

Frame 4 (smoke rolls in, ~0.60 s):
  Disc begins to shrink. Dark brownish-grey smoke (#4a3830) covers the outer third, rolling
  over the orange core (#d8742a) that persists in the centre. Opacity ~0.8.

Frame 5 (smoke dominant, ~0.75 s):
  Smoke (#3a2e28) covers ~70% of the disc. Small residual orange-red ember at centre.
  The overall shape is slightly smaller and more irregular. Opacity ~0.75.

Frame 6 (dissipating, ~0.90 s):
  Smoke thinning and becoming translucent dark charcoal (#2a2420, ~50% opacity overall).
  Wispy tendrils radiate outward. The disc is notably smaller. Central glow gone.

Frame 7 (wisps, ~1.05 s):
  Nearly transparent. Faint irregular charcoal wisps (#2a2420, ~15–20% opacity).
  Most of the frame is empty/transparent. This frame must end completely clear so the
  effect fades cleanly with no hard pop.

Palette anchors: white-yellow #fff5c8, orange-yellow #f0a020, spice orange #d8742a,
deep orange-red #c04010, charred brown #4a3830, dark smoke #3a2e28, charcoal #2a2420.

Style: desert-military RTS, Dune-inspired. Muted, desaturated smoke; vivid but not
neon fire tones. High readability at small scale. No text, no UI, no border around
individual frames, no team colours.

Export: 512 × 64 px PNG, transparent background, sRGB. (Author at 2048 × 256 px
then downscale to 512 × 64 for crisp sub-pixel edges.)
```

### Large sheet (1024 × 128 px, 8 frames — optional, preferred for building deaths)

```
Same as above but with these dimension changes:
  - Total image: 1024 × 128 px
  - 8 frames, each 128 × 128 px, left-to-right, zero padding
  - Frame 0 at x=0, frame 7 at x=896
  - Same frame-by-frame progression and palette
  - Author at 4096 × 512 px, downscale to 1024 × 128 on export
  - Filename: fx-explosion-large.png
The larger frame size allows richer smoke-wisp detail and a more impactful building-death
blast. The fireball silhouettes should be correspondingly more detailed — individual tongues
of flame in frames 1–3, distinct smoke billows in frames 4–6.
```
