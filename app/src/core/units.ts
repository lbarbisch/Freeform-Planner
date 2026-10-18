/** Multi-subpart parts (e.g. the two amplifiers and the supply of a dual op-amp): every subpart
 * is its own schematic instance with its own pins, the instances of subparts B, C, ... point to
 * subpart A via `parentId`. */
import { transformPoint2 } from './geometry';
import { nextId } from './ids';
import type { Project, SymbolInstance } from './model';
import { symbolOf, unitOf } from './netlist';
import { unitCount, unitOffsets } from './symbols';

/** Keeps every part complete: missing subparts are added next to subpart A, subparts whose
 * part is gone (or which the symbol no longer has) are removed. Returns the same object when
 * nothing changed. */
export function syncUnits(project: Project): Project {
  const instances = { ...project.schematic.instances };
  let changed = false;
  const present = new Map<string, Set<number>>();

  for (const inst of Object.values(project.schematic.instances)) {
    if (!inst.parentId) continue;
    const main = instances[inst.parentId];
    const symbol = main && !main.parentId ? symbolOf(project, main) : undefined;
    const units = present.get(inst.parentId) ?? new Set<number>();
    const unit = unitOf(inst);
    if (!main || !symbol || unit < 2 || unit > unitCount(symbol) || units.has(unit) || inst.partId !== main.partId) {
      delete instances[inst.id];
      changed = true;
      continue;
    }
    units.add(unit);
    present.set(inst.parentId, units);
  }

  for (const main of Object.values(project.schematic.instances)) {
    if (main.parentId) continue;
    const symbol = symbolOf(project, main);
    if (!symbol) continue;
    const n = unitCount(symbol);
    if (n <= 1) {
      if (main.unit !== undefined) {
        const { unit: _, ...rest } = main;
        instances[main.id] = rest;
        changed = true;
      }
      continue;
    }
    if (main.unit !== 1) {
      instances[main.id] = { ...main, unit: 1 };
      changed = true;
    }
    const units = present.get(main.id);
    const offsets = unitOffsets(symbol);
    for (let u = 2; u <= n; u++) {
      if (units?.has(u)) continue;
      const id = nextId('i', instances);
      const sub: SymbolInstance = { ...main, id, unit: u, parentId: main.id, at: transformPoint2(main.at, main.rotation, main.mirror, offsets[u - 1]!) };
      instances[id] = sub;
      changed = true;
    }
  }
  if (!changed) return project;
  return { ...project, schematic: { ...project.schematic, instances } };
}

/** Ids of all instances of the physical part the given instance belongs to. */
export function partInstances(project: Project, id: string): string[] {
  const inst = project.schematic.instances[id];
  if (!inst) return [];
  const owner = inst.parentId ?? inst.id;
  return Object.values(project.schematic.instances)
    .filter((i) => i.id === owner || i.parentId === owner)
    .map((i) => i.id);
}
