import { describe, expect, it } from 'vitest';
import {
  autoPinMap,
  duplicateItem,
  groupParts,
  mergeLibraries,
  newFootprint,
  newPart,
  newSymbol,
  removeItem,
  uniqueId,
  upsert,
  usages,
  validateFootprint,
  validatePart,
  validateSymbol,
} from './libraryCommands';
import { emptyLibrary, type Library } from './model';
import { testLibrary } from './testing';

const lib = (): Library => ({ ...emptyLibrary('t'), ...testLibrary() });

describe('library commands', () => {
  it('creates unique ids from names', () => {
    expect(uniqueId(' My part! ', {})).toBe('My_part');
    expect(uniqueId('RES', { RES: 1, RES_2: 1 })).toBe('RES_3');
    expect(uniqueId('***', {})).toBe('ITEM');
  });

  it('creates new items with unique ids', () => {
    const l = lib();
    expect(newSymbol(l, 'R').id).toBe('R_2');
    expect(newFootprint(l).pins).toHaveLength(2);
    expect(newPart(l).symbolId).toBe('D');
    expect(newPart(emptyLibrary()).symbolId).toBe('');
  });

  it('upserts, duplicates and removes', () => {
    let l = upsert(lib(), 'symbols', newSymbol(lib(), 'X'));
    expect(l.symbols.X).toBeDefined();
    const d = duplicateItem(l, 'symbols', 'X');
    expect(d.id).toBe('X_copy');
    expect(d.library.symbols.X_copy!.name).toBe('X copy');
    expect(duplicateItem(l, 'symbols', 'NOPE').id).toBeNull();
    l = removeItem(d.library, 'symbols', 'X_copy').library;
    expect(l.symbols.X_copy).toBeUndefined();
  });

  it('refuses to remove items that are in use', () => {
    expect(usages(lib(), 'symbols', 'R')).toEqual(['RES']);
    expect(usages(lib(), 'footprints', 'R_SHORT')).toEqual(['DIODE', 'RES']);
    expect(usages(lib(), 'parts', 'RES')).toEqual([]);
    const r = removeItem(lib(), 'footprints', 'R_SHORT');
    expect(r.error).toMatch(/DIODE, RES/);
    expect(removeItem(lib(), 'parts', 'RES').error).toBeNull();
  });

  it('auto-maps pins by number', () => {
    const l = lib();
    const fp = { ...l.footprints.R_LONG!, pins: [l.footprints.R_LONG!.pins[0]!] };
    expect(autoPinMap(l.symbols.R!, fp)).toEqual({ '1': '1' });
  });

  it('groups parts, power symbols under Power and ungrouped parts under Other', () => {
    const l = lib();
    const parts = Object.values(l.parts).map((p) => ({ ...p, group: p.id === 'RES' ? 'Passives' : '' }));
    const groups = groupParts(l, parts);
    expect(groups.map((g) => g.group)).toEqual(['Passives', 'Power', 'Other']);
    expect(groups[0]!.parts.map((p) => p.id)).toEqual(['RES']);
    expect(groups[1]!.parts.map((p) => p.id)).toEqual(['GND']);
  });

  it('merges libraries', () => {
    const base = emptyLibrary();
    const a = mergeLibraries(base, testLibrary(), false);
    expect(a.added).toBe(10);
    const b = mergeLibraries(a.library, testLibrary(), false);
    expect(b).toMatchObject({ added: 0, skipped: 10 });
    expect(mergeLibraries(a.library, testLibrary(), true).added).toBe(10);
  });
});

describe('validation', () => {
  it('accepts the test library', () => {
    const l = lib();
    for (const p of Object.values(l.parts)) expect(validatePart(l, p)).toEqual([]);
    for (const s of Object.values(l.symbols)) expect(validateSymbol(s)).toEqual([]);
    for (const f of Object.values(l.footprints)) expect(validateFootprint(f)).toEqual([]);
  });

  it('reports part problems', () => {
    const l = lib();
    const res = l.parts.RES!;
    expect(validatePart(l, { ...res, symbolId: 'NOPE' })).toEqual(['Symbol "NOPE" does not exist.']);
    expect(validatePart(l, { ...res, variants: [] })[0]).toMatch(/no footprint/);
    const issues = validatePart(l, {
      ...res,
      variants: [
        { footprintId: 'NOPE', pinMap: {} },
        { footprintId: 'R_LONG', pinMap: { '1': '9' } },
        { footprintId: 'R_LONG', pinMap: { '1': '1', '2': '1' } },
      ],
    });
    expect(issues).toEqual([
      'Variant 1: footprint "NOPE" does not exist.',
      'Variant 2 (R_LONG): footprint has no pin 9.',
      'Variant 2 (R_LONG): symbol pin 2 is not mapped.',
      'Variant 3 (R_LONG): pins 1 and 2 both map to footprint pin 1.',
    ]);
  });

  it('reports symbol and footprint problems', () => {
    const s = testLibrary().symbols.R!;
    expect(validateSymbol({ ...s, refPrefix: ' ', pins: [s.pins[0]!, { ...s.pins[0]!, at: [0.5, 0] }] })).toEqual([
      'Pin number 1 is used twice.',
      'Pin 1 is not on the grid; wires will not connect to it.',
      'The reference prefix is empty.',
    ]);
    const f = testLibrary().footprints.WIRE_A!;
    expect(validateFootprint({ ...f, pins: [f.pins[0]!, f.pins[0]!, f.pins[1]!] })).toEqual(['Pin number 1 is used twice.', 'Wire footprints need exactly two pins.']);
  });
});
