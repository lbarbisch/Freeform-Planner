/** Pure edit operations and validation for libraries (used by the library editor). */
import type { FootprintDef, Library, LibrarySet, PartDef, SymbolDef } from './model';
import { naturalCompare } from './netlist';
import { itemUnit, unitCount, unitName } from './symbols';

export type LibraryKind = 'symbols' | 'footprints' | 'parts';

/** Turns a display name into an id that is unique within the collection. */
export function uniqueId(name: string, existing: Record<string, unknown>): string {
  const base = name.trim().replace(/[^A-Za-z0-9_+-]+/g, '_').replace(/^_+|_+$/g, '') || 'ITEM';
  if (!(base in existing)) return base;
  for (let n = 2; ; n++) if (!(`${base}_${n}` in existing)) return `${base}_${n}`;
}

export function upsert<K extends LibraryKind>(lib: Library, kind: K, item: Library[K][string]): Library {
  return { ...lib, [kind]: { ...lib[kind], [item.id]: item } };
}

/** Items that reference the given item (parts use symbols and footprints). */
export function usages(lib: LibrarySet, kind: LibraryKind, id: string): string[] {
  const parts = Object.values(lib.parts);
  const users =
    kind === 'symbols' ? parts.filter((p) => p.symbolId === id) : kind === 'footprints' ? parts.filter((p) => p.variants.some((v) => v.footprintId === id)) : [];
  return users.map((p) => p.id).sort(naturalCompare);
}

export function removeItem(lib: Library, kind: LibraryKind, id: string): { library: Library; error: string | null } {
  const used = usages(lib, kind, id);
  if (used.length) return { library: lib, error: `"${id}" is used by ${used.join(', ')}` };
  const items = { ...lib[kind] };
  delete items[id];
  return { library: { ...lib, [kind]: items }, error: null };
}

export function duplicateItem<K extends LibraryKind>(lib: Library, kind: K, id: string): { library: Library; id: string | null } {
  const item = lib[kind][id];
  if (!item) return { library: lib, id: null };
  const newId = uniqueId(`${id}_copy`, lib[kind]);
  // items are plain JSON data
  const copy = { ...(JSON.parse(JSON.stringify(item)) as typeof item), id: newId, name: `${item.name} copy` };
  return { library: upsert(lib, kind, copy as Library[K][string]), id: newId };
}

export function newSymbol(lib: Library, name = 'NEW_SYMBOL'): SymbolDef {
  return {
    id: uniqueId(name, lib.symbols),
    name,
    refPrefix: 'U',
    graphics: [{ kind: 'rect', from: [-3, -3], to: [3, 3], fill: false }],
    pins: [
      { number: '1', name: '', at: [-5, 0], dir: 'right', length: 2 },
      { number: '2', name: '', at: [5, 0], dir: 'left', length: 2 },
    ],
    refAt: [0, -4],
    valueAt: [0, 4],
    showPinNumbers: true,
    showPinNames: false,
    power: false,
  };
}

export function newFootprint(lib: Library, name = 'NEW_FOOTPRINT'): FootprintDef {
  return {
    id: uniqueId(name, lib.footprints),
    name,
    model: { kind: 'none' },
    modelRotation: [0, 0, 0, 1],
    modelOffset: [0, 0, 0],
    modelScale: 1,
    pins: [
      { number: '1', position: [2.54, 0, 0] },
      { number: '2', position: [-2.54, 0, 0] },
    ],
    isWire: false,
  };
}

export function newPart(lib: Library, name = 'NEW_PART'): PartDef {
  const symbolId = Object.keys(lib.symbols).sort()[0] ?? '';
  return { id: uniqueId(name, lib.parts), name, description: '', symbolId, defaultValue: name, variants: [] };
}

/** Changes the number of subparts. Adding subparts adds empty ones (a plain symbol becomes
 * subpart A); removing subparts deletes their graphics and pins. */
export function setUnitCount(symbol: SymbolDef, count: number): SymbolDef {
  const n = Math.max(1, Math.min(26, Math.round(count)));
  if (n === unitCount(symbol)) return symbol;
  const fit = <T extends { unit?: number | undefined }>(items: T[]): T[] =>
    items
      .filter((item) => itemUnit(item) <= n)
      .map((item) => {
        if (n > 1) return item;
        const { unit: _, ...rest } = item;
        return rest as T;
      });
  const { units: _, ...rest } = symbol;
  return { ...rest, graphics: fit(symbol.graphics), pins: fit(symbol.pins), ...(n > 1 && { units: n }) };
}

/** Copies the drawing and pins of subpart `from` into subpart `to`. Copied pins get new numbers
 * (continuing after the highest number in use) so every physical pin stays unique. */
export function copyUnit(symbol: SymbolDef, from: number, to: number): SymbolDef {
  if (from === to) return symbol;
  const numbers = symbol.pins.map((p) => Number(p.number)).filter(Number.isFinite);
  let next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  const graphics = symbol.graphics.filter((g) => itemUnit(g) === from).map((g) => ({ ...g, unit: to }));
  const pins = symbol.pins.filter((p) => itemUnit(p) === from).map((p) => ({ ...p, number: String(next++), unit: to }));
  return { ...symbol, graphics: [...symbol.graphics, ...graphics], pins: [...symbol.pins, ...pins] };
}

/** Maps every symbol pin to the footprint pin with the same number (where one exists). */
export function autoPinMap(symbol: SymbolDef, footprint: FootprintDef): Record<string, string> {
  const fpPins = new Set(footprint.pins.map((p) => p.number));
  const map: Record<string, string> = {};
  for (const p of symbol.pins) if (fpPins.has(p.number)) map[p.number] = p.number;
  return map;
}

/** Problems that make a part unusable or ambiguous. Empty when the part is fine. */
export function validatePart(lib: LibrarySet, part: PartDef): string[] {
  const issues: string[] = [];
  const symbol = lib.symbols[part.symbolId];
  if (!symbol) return [`Symbol "${part.symbolId}" does not exist.`];
  if (!symbol.power && part.variants.length === 0) issues.push('The part has no footprint, so it will not appear in the 3D layout.');
  part.variants.forEach((v, i) => {
    const fp = lib.footprints[v.footprintId];
    const label = `Variant ${i + 1}`;
    if (!fp) {
      issues.push(`${label}: footprint "${v.footprintId}" does not exist.`);
      return;
    }
    const fpPins = new Set(fp.pins.map((p) => p.number));
    const used = new Map<string, string>();
    for (const sp of symbol.pins) {
      const target = v.pinMap[sp.number];
      if (!target) issues.push(`${label} (${fp.name}): symbol pin ${sp.number} is not mapped.`);
      else if (!fpPins.has(target)) issues.push(`${label} (${fp.name}): footprint has no pin ${target}.`);
      else if (used.has(target)) issues.push(`${label} (${fp.name}): pins ${used.get(target)} and ${sp.number} both map to footprint pin ${target}.`);
      else used.set(target, sp.number);
    }
  });
  return issues;
}

export function validateSymbol(symbol: SymbolDef): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const p of symbol.pins) {
    if (seen.has(p.number)) issues.push(`Pin number ${p.number} is used twice.`);
    seen.add(p.number);
    if (!Number.isInteger(p.at[0]) || !Number.isInteger(p.at[1])) issues.push(`Pin ${p.number} is not on the grid; wires will not connect to it.`);
  }
  if (!symbol.refPrefix.trim()) issues.push('The reference prefix is empty.');
  const units = unitCount(symbol);
  for (const p of symbol.pins) {
    if (itemUnit(p) > units) issues.push(`Pin ${p.number} belongs to subpart ${unitName(itemUnit(p))}, but the symbol has only ${units} subpart${units === 1 ? '' : 's'}.`);
  }
  const orphanGraphics = symbol.graphics.filter((g) => itemUnit(g) > units).length;
  if (orphanGraphics) issues.push(`${orphanGraphics} graphic${orphanGraphics === 1 ? ' belongs' : 's belong'} to a subpart the symbol does not have.`);
  if (units > 1) {
    for (let u = 1; u <= units; u++) {
      if (!symbol.pins.some((p) => itemUnit(p) === u)) issues.push(`Subpart ${unitName(u)} has no pins.`);
    }
  }
  return issues;
}

export function validateFootprint(fp: FootprintDef): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const p of fp.pins) {
    if (seen.has(p.number)) issues.push(`Pin number ${p.number} is used twice.`);
    seen.add(p.number);
  }
  if (fp.isWire && fp.pins.length !== 2) issues.push('Wire footprints need exactly two pins.');
  return issues;
}

/** Adds items of `other` to `lib`. Items with the same id are replaced when `overwrite` is set. */
export function mergeLibraries(lib: Library, other: LibrarySet, overwrite: boolean): { library: Library; added: number; skipped: number } {
  let added = 0;
  let skipped = 0;
  const next: Library = { ...lib, symbols: { ...lib.symbols }, footprints: { ...lib.footprints }, parts: { ...lib.parts } };
  for (const kind of ['symbols', 'footprints', 'parts'] as const) {
    for (const [id, item] of Object.entries(other[kind])) {
      if (id in next[kind] && !overwrite) {
        skipped++;
        continue;
      }
      (next[kind] as Record<string, unknown>)[id] = item;
      added++;
    }
  }
  return { library: next, added, skipped };
}
