# Units Sprites — Note

## Current Engine Behaviour

Units are drawn by `drawUnit()` in `src/render/renderer.ts` entirely in code — no sprite
files are used. The engine renders each unit as a **small triangle** (infantry/vehicles) or
**filled rectangle** (harvesters) rotated to the unit's current `facing` angle, then adds:

- A 1.5 px owner-coloured selection ring (circle).
- A tiny 2 × 2 px owner pip above the unit.
- An HP bar (3 px tall) above the unit when damaged.
- A muzzle flash dot at the weapon tip when firing.
- A semi-transparent ellipse shadow beneath flying units.

**Buildings are the art priority.** The building spec files in this folder are the first
deliverable. Units can receive the same sprite treatment in a later pass.

---

## Unit Roster — IDs, Names, Radii

The `radius` value is the draw radius in pixels (CSS px at zoom 1) and doubles as the
collision / separation radius. All values from `src/world/defs.ts`.

| Unit ID    | Name             | Kind      | Radius (px) | Notes                          |
|------------|------------------|-----------|-------------|--------------------------------|
| `infantry` | Light Infantry   | infantry  | 6 px        | Basic foot soldier             |
| `rocket`   | Rocket Trooper   | infantry  | 6 px        | Anti-armour / anti-air         |
| `harvester`| Harvester        | vehicle   | 11 px       | Drawn as rectangle, not triangle |
| `scout`    | Recon Buggy      | vehicle   | 8 px        | Fast, fragile                  |
| `tank`     | Battle Tank      | vehicle   | 11 px       | Heavy armour                   |
| `artillery`| Artillery        | vehicle   | 11 px       | Siege, long range              |
| `aircraft` | Ornithopter      | aircraft  | 9 px        | Flying; gets shadow beneath it |

---

## How Unit Sprites Would Work

When you're ready to sprite units, use the same approach as buildings:

1. **View:** top-down orthographic, directly overhead. No isometric, no perspective.
2. **Faction-neutral:** same rules as buildings — no team-colour bake-in. The engine
   draws the owner pip and selection ring on top.
3. **Facing / rotation:** two options:
   - **Single-frame + engine rotation** (simplest): author the unit facing right
     (0 radians = east). The engine already calls `ctx.rotate(u.facing)` before drawing,
     so a single frame will rotate correctly at runtime.
   - **8-direction sheet** (higher quality): author 8 frames at 45° increments (N, NE, E,
     SE, S, SW, W, NW), left-to-right in a horizontal strip. The engine would need a small
     change to pick the nearest direction frame instead of rotating.
4. **Frame size:** `radius * 2 × radius * 2` px (the bounding box of the drawn shape).
   For example, `infantry` at radius 6 → 12 × 12 px final. Author at 4× (48 × 48) and
   downscale.
5. **Harvester special case:** currently drawn as a rectangle `radius*2 × radius*1.6`.
   A harvester sprite would be `22 × 18 px` final (4× author: 88 × 72 px), with a fill
   indicator region visible (the engine currently draws a fill-level bar in the body).
6. **Aircraft:** same top-down approach; the engine already draws a ground shadow ellipse
   beneath flying units, so the sprite does not need to include a shadow.

### Suggested file names

```
unit-<id>.png            ← single-frame (facing east)
unit-<id>-sheet.png      ← 8-direction strip (frames: E NE N NW W SW S SE)
```
