// Selection helpers used by the controller. Extracted so node checks can drive the same
// functions the live game uses (plain click, shift-toggle, on-screen same-type double-click).

import { TILE } from '../world/constants';
import type { World } from '../world/world';
import type { Building } from '../world/building';
import type { Faction } from '../world/defs';

export const DOUBLE_CLICK_MS = 350;

export interface Selection {
  selected: Set<number>;
  selectedBuilding: Building | null;
}

export interface ViewRect {
  x: number;
  y: number;
  viewW: number;
  viewH: number;
}

export function isDoubleClick(prevId: number, prevT: number, id: number, now: number): boolean {
  return id === prevId && now - prevT < DOUBLE_CLICK_MS && prevId >= 0;
}

export function unitInView(x: number, y: number, view: ViewRect): boolean {
  return x >= view.x && x <= view.x + view.viewW && y >= view.y && y <= view.y + view.viewH;
}

/** Replace the selection with every living friendly unit of `defId` currently inside `view`. */
export function selectSameTypeOnScreen(
  selected: Set<number>,
  world: World,
  view: ViewRect,
  defId: string,
  faction: Faction,
): void {
  selected.clear();
  for (const u of world.units) {
    if (!u.alive || u.owner !== faction || u.def.id !== defId) continue;
    if (!unitInView(u.x, u.y, view)) continue;
    selected.add(u.id);
  }
}

/**
 * Apply a point-click to `sel` (mutates the set in place).
 * - plain click on a unit: replace selection with that unit
 * - shift-click on a unit: add it, or remove it if already selected
 * - double-click on a unit: select all on-screen friendlies of that type
 * - shift-click empty / a building: keep the current unit selection
 * - plain click empty: clear units; select a friendly building if one is under the cursor
 * Returns true when the UI should play the select cue.
 */
export function applyClickSelect(
  sel: Selection,
  world: World,
  wx: number,
  wy: number,
  faction: Faction,
  opts: { shift: boolean; doubleClick: boolean; view: ViewRect },
): boolean {
  const u = world.unitAt(wx, wy, faction);
  if (u) {
    sel.selectedBuilding = null;
    if (opts.doubleClick) {
      selectSameTypeOnScreen(sel.selected, world, opts.view, u.def.id, faction);
      return sel.selected.size > 0;
    }
    if (opts.shift) {
      if (sel.selected.has(u.id)) sel.selected.delete(u.id);
      else sel.selected.add(u.id);
      return true;
    }
    sel.selected.clear();
    sel.selected.add(u.id);
    return true;
  }
  if (opts.shift) return false;
  sel.selected.clear();
  const b = world.buildingAtTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
  sel.selectedBuilding = b && b.owner === faction ? b : null;
  return !!sel.selectedBuilding;
}
