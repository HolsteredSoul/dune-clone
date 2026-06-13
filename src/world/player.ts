// Per-faction state: credits and production queues. Power and tech prerequisites are derived
// from owned buildings by the world (single source of truth = the building list), not stored
// here, so they can't drift.

import { STARTING_CREDITS } from './constants';
import type { Faction } from './defs';

export interface BuildItem {
  defId: string;
  progress: number; // 0..1
  cost: number;
  time: number;     // seconds at full power
}

export class Player {
  credits = STARTING_CREDITS;

  // Structures build one at a time at the construction yard.
  building: BuildItem | null = null;
  ready: string | null = null; // completed building def id awaiting placement (human only)

  // Units queue per producing building type (e.g. 'barracks', 'factory', 'helipad').
  unitQueues = new Map<string, BuildItem[]>();

  constructor(readonly faction: Faction) {}

  enqueueUnit(builtAt: string, item: BuildItem): void {
    const q = this.unitQueues.get(builtAt);
    if (q) q.push(item);
    else this.unitQueues.set(builtAt, [item]);
  }
}
