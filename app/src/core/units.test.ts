import { describe, expect, it } from 'vitest';
import { annotate, deleteSelection, emptySelection, groupPivot, insertLayoutWire, placePart, rotateGroup, setProjectName, setRef, setTransform, setValue, setVariant, setWireFootprint, updateFromLibrary, wireFootprints } from './commands';
import { syncLayout } from './layout';
import { copyUnit, setUnitCount, validateSymbol } from './libraryCommands';
import { emptyProject, type LibrarySet, type Project, type SymbolDef } from './model';
import { deriveNetlist, displayRef, instancePinPoints, symbolOf } from './netlist';
import { symbolUnit, unitOffsets } from './symbols';
import { testLibrary } from './testing';
import { partInstances } from './units';

/** Two gates (pins 1-2 and 3-4) and a supply subpart (pin 5), like a dual op-amp. */
const dual: SymbolDef = {
  id: 'DUAL',
  name: 'DUAL',
  refPrefix: 'U',
  units: 3,
  graphics: [
    { kind: 'rect', from: [-2, -2], to: [2, 2], fill: false, unit: 1 },
    { kind: 'circle', center: [0, 0], radius: 2, fill: false, unit: 2 },
    { kind: 'rect', from: [-1, -2], to: [1, 2], fill: false, unit: 3 },
  ],
  pins: [
    { number: '1', name: 'A', at: [-4, 0], dir: 'right', length: 2, unit: 1 },
    { number: '2', name: 'Y', at: [4, 0], dir: 'left', length: 2, unit: 1 },
    { number: '3', name: 'A', at: [-4, 0], dir: 'right', length: 2, unit: 2 },
    { number: '4', name: 'Y', at: [4, 0], dir: 'left', length: 2, unit: 2 },
    { number: '5', name: 'VCC', at: [0, -4], dir: 'down', length: 2, unit: 3 },
  ],
  refAt: [0, -5],
  valueAt: [0, 5],
  showPinNumbers: true,
  showPinNames: false,
  power: false,
};

const pinsPerInstance = (project: Project, ids: string[]) =>
  ids.map((id) => {
    const inst = project.schematic.instances[id]!;
    return instancePinPoints(inst, symbolOf(project, inst)!).map((p) => p.pin);
  });

function lib(): LibrarySet {
  const l = testLibrary();
  l.symbols.DUAL = dual;
  l.footprints.DIP5 = {
    ...l.footprints.R_LONG!,
    id: 'DIP5',
    pins: ['1', '2', '3', '4', '5'].map((number, i) => ({ number, position: [i * 2.54, 0, 0] })),
  };
  l.parts.GATES = {
    id: 'GATES',
    name: 'GATES',
    description: '',
    symbolId: 'DUAL',
    defaultValue: 'gates',
    variants: [{ footprintId: 'DIP5', pinMap: { '1': '1', '2': '2', '3': '3', '4': '4', '5': '5' } }],
  };
  return l;
}

describe('multi-subpart parts', () => {
  it('places every subpart side by side, on the grid', () => {
    const r = placePart(emptyProject(), lib(), 'GATES', [10, 10]);
    expect(r.ids).toHaveLength(3);
    const [a, b] = r.ids.map((id) => r.project.schematic.instances[id]!);
    expect(a).toMatchObject({ unit: 1, ref: 'U1' });
    expect(a!.parentId).toBeUndefined();
    expect(b).toMatchObject({ unit: 2, parentId: a!.id, ref: 'U1', at: [10 + unitOffsets(dual)[1]![0], 10] });
    expect(Number.isInteger(b!.at[0])).toBe(true);
    expect(displayRef(r.project, b!)).toBe('U1B');
  });

  it('places the part once in the 3D layout', () => {
    const r = placePart(emptyProject(), lib(), 'GATES', [0, 0]);
    expect(Object.keys(r.project.layout.placements)).toEqual([r.id]);
  });

  it('gives each subpart only its own pins and graphics', () => {
    const r = placePart(emptyProject(), lib(), 'GATES', [0, 0]);
    expect(pinsPerInstance(r.project, r.ids)).toEqual([['1', '2'], ['3', '4'], ['5']]);
    expect([1, 2, 3].map((u) => symbolUnit(dual, u).graphics.map((g) => g.kind))).toEqual([['rect'], ['circle'], ['rect']]);
  });

  it('treats items without a subpart as subpart A, never as shared', () => {
    const untagged: SymbolDef = { ...dual, pins: dual.pins.map((p) => (p.number === '1' ? { ...p, unit: undefined } : p)) };
    expect(symbolUnit(untagged, 1).pins.map((p) => p.number)).toEqual(['1', '2']);
    expect(symbolUnit(untagged, 2).pins.map((p) => p.number)).toEqual(['3', '4']);
  });

  it('netlists subpart pins under the id of subpart A', () => {
    const l = lib();
    let { project: p, ids } = placePart(emptyProject(), l, 'GATES', [0, 0]);
    // a resistor touching pin 3 of subpart B
    const b = p.schematic.instances[ids[1]!]!;
    const pin3 = instancePinPoints(b, dual).find((x) => x.pin === '3')!.point;
    const res = placePart(p, l, 'RES', [pin3[0] - 3, pin3[1]]);
    p = res.project;
    const net = deriveNetlist(p).nets.find((n) => n.nodes.some((x) => x.pin === '3'))!;
    expect(net.nodes).toEqual([
      { instanceId: res.id, pin: '2' },
      { instanceId: ids[0], pin: '3' },
    ]);
  });

  it('deletes all subparts when one of them is deleted', () => {
    const { project, ids } = placePart(emptyProject(), lib(), 'GATES', [0, 0]);
    const next = deleteSelection(project, { ...emptySelection(), instances: [ids[2]!] });
    expect(next.schematic.instances).toEqual({});
    expect(next.layout.placements).toEqual({});
  });

  it('shares reference and value between subparts', () => {
    const { project, ids } = placePart(emptyProject(), lib(), 'GATES', [0, 0]);
    const p = setValue(setRef(project, ids[1]!, 'U7'), ids[1]!, '74HC00');
    expect(ids.map((id) => p.schematic.instances[id]!.ref)).toEqual(['U7', 'U7', 'U7']);
    expect(ids.map((id) => p.schematic.instances[id]!.value)).toEqual(['74HC00', '74HC00', '74HC00']);
  });

  it('annotates the part once and copies the reference to its subparts', () => {
    const { project, ids } = placePart(emptyProject(), lib(), 'GATES', [0, 0]);
    const unannotated = { ...project, schematic: { ...project.schematic, instances: Object.fromEntries(Object.entries(project.schematic.instances).map(([k, v]) => [k, { ...v, ref: 'U?' }])) } };
    const p = annotate(unannotated);
    expect(ids.map((id) => p.schematic.instances[id]!.ref)).toEqual(['U1', 'U1', 'U1']);
  });

  it('adds and removes subparts when the library symbol changes', () => {
    const l = lib();
    const { project, id } = placePart(emptyProject(), l, 'GATES', [0, 0]);
    const four = { ...l, symbols: { ...l.symbols, DUAL: { ...dual, units: 4 } } };
    expect(partInstances(updateFromLibrary(project, four), id)).toHaveLength(4);
    const one = { ...l, symbols: { ...l.symbols, DUAL: setUnitCount(dual, 1) } };
    const single = updateFromLibrary(project, one);
    expect(Object.values(single.schematic.instances)).toEqual([expect.objectContaining({ id })]);
    expect(single.schematic.instances[id]!.unit).toBeUndefined();
  });

  it('removes subparts whose part is gone', () => {
    const { project, ids } = placePart(emptyProject(), lib(), 'GATES', [0, 0]);
    const instances = { ...project.schematic.instances };
    delete instances[ids[0]!];
    const p = syncLayout({ ...project, schematic: { ...project.schematic, instances } });
    expect(p.schematic.instances).toEqual({});
  });

  it('reports pins numbered twice, even in different subparts', () => {
    const twice: SymbolDef = { ...dual, pins: dual.pins.map((p) => (p.number === '5' ? { ...p, number: '1' } : p)) };
    expect(validateSymbol(twice)).toContain('Pin number 1 is used twice.');
  });

  it('reports items of subparts the symbol does not have, and empty subparts', () => {
    expect(validateSymbol(dual)).toEqual([]);
    expect(validateSymbol({ ...dual, units: 2 })).toEqual(['Pin 5 belongs to subpart C, but the symbol has only 2 subparts.', '1 graphic belongs to a subpart the symbol does not have.']);
    expect(validateSymbol({ ...dual, units: 4 })).toEqual(['Subpart D has no pins.']);
  });
});

describe('editing subparts', () => {
  const plain = testLibrary().symbols.R!;

  it('turns a plain symbol into subpart A and adds empty subparts', () => {
    const s = setUnitCount(plain, 3);
    expect(s.units).toBe(3);
    expect(symbolUnit(s, 1).pins).toHaveLength(2);
    expect(symbolUnit(s, 2).pins).toEqual([]);
    expect(symbolUnit(s, 3).graphics).toEqual([]);
  });

  it('deletes the items of removed subparts', () => {
    const s = setUnitCount(dual, 2);
    expect(s.pins.map((p) => p.number)).toEqual(['1', '2', '3', '4']);
    expect(s.graphics).toHaveLength(2);
    expect(validateSymbol(s)).toEqual([]);
  });

  it('merges subpart A back into a plain symbol', () => {
    expect(setUnitCount(setUnitCount(plain, 2), 1)).toEqual(plain);
    const merged = setUnitCount(dual, 1);
    expect(merged.units).toBeUndefined();
    expect(merged.pins).toEqual([
      { number: '1', name: 'A', at: [-4, 0], dir: 'right', length: 2 },
      { number: '2', name: 'Y', at: [4, 0], dir: 'left', length: 2 },
    ]);
  });

  it('copies a subpart with fresh pin numbers', () => {
    const s = copyUnit(setUnitCount(dual, 4), 1, 4);
    const copied = s.pins.filter((p) => p.unit === 4);
    expect(copied.map((p) => [p.number, p.name])).toEqual([
      ['6', 'A'],
      ['7', 'Y'],
    ]);
    expect(s.graphics.filter((g) => g.unit === 4)).toEqual([{ ...dual.graphics[0], unit: 4 }]);
    expect(validateSymbol(s)).toEqual([]);
  });
});

describe('layout group edits', () => {
  const l = testLibrary();
  const two = () => {
    let p = emptyProject();
    const a = placePart(p, l, 'RES', [0, 0]);
    const b = placePart(a.project, l, 'RES', [10, 0]);
    p = setTransform(setTransform(b.project, a.id, { position: [0, 0, 0] }), b.id, { position: [10, 0, 0] });
    return { p, ids: [a.id, b.id] };
  };

  it('rotates a group around its common center', () => {
    const { p, ids } = two();
    expect(groupPivot(p, ids)).toEqual([5, 0, 0]);
    const r = rotateGroup(p, ids, [0, 1, 0], 180);
    expect(r.layout.placements[ids[0]!]!.position.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([10, 0, 0]);
    expect(r.layout.placements[ids[1]!]!.position.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, 0, 0]);
  });

  it('rotates a single object in place', () => {
    const { p, ids } = two();
    const r = rotateGroup(p, [ids[1]!], [0, 1, 0], 90);
    expect(r.layout.placements[ids[1]!]!.position).toEqual([10, 0, 0]);
  });

  it('switches a wire to another wire footprint, embedding it from the library', () => {
    const { p, ids } = two();
    const onlyA = { ...l, footprints: { ...l.footprints } };
    delete onlyA.footprints.WIRE_B;
    const w = insertLayoutWire(p, onlyA, { instanceId: ids[0]!, pin: '1' }, [0, 0, 0]);
    expect(Object.keys(w.project.library.footprints)).not.toContain('WIRE_B');
    expect(wireFootprints(w.project, l).map((f) => f.id)).toEqual(['WIRE_A', 'WIRE_B']);
    const next = setWireFootprint(w.project, l, w.id!, 'WIRE_B');
    expect(next.layout.wires[w.id!]!.footprintId).toBe('WIRE_B');
    expect(next.library.footprints.WIRE_B).toBeDefined();
    // only wire footprints are accepted
    expect(setWireFootprint(w.project, l, w.id!, 'R_LONG')).toBe(w.project);
  });

  it('selects a footprint variant', () => {
    const { p, ids } = two();
    expect(setVariant(p, ids[0]!, 1).layout.placements[ids[0]!]!.variant).toBe(1);
    expect(setVariant(p, ids[0]!, 5)).toBe(p);
  });
});

describe('project name', () => {
  it('trims and ignores empty names', () => {
    const p = emptyProject();
    expect(setProjectName(p, '  Blinker ').name).toBe('Blinker');
    expect(setProjectName(p, '   ')).toBe(p);
  });
});
