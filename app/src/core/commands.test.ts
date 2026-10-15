import { describe, expect, it } from 'vitest';
import {
  addLabel,
  addWire,
  annotate,
  cycleVariant,
  deleteSelection,
  embedPart,
  getTransform,
  insertLayoutWire,
  mirrorInstance,
  moveSelection,
  nextId,
  placePart,
  pruneLibrary,
  removeLayoutWire,
  renameLabel,
  resetRotation,
  rotate,
  rotateInstance,
  setRef,
  setTransform,
  setValue,
  translate,
  updateFromLibrary,
} from './commands';
import { emptyProject, type Project } from './model';
import { testLibrary } from './testing';

const lib = testLibrary();

function placed(...at: [number, number][]): { p: Project; ids: string[] } {
  let p = emptyProject();
  const ids: string[] = [];
  for (const a of at) {
    const r = placePart(p, lib, 'RES', a);
    p = r.project;
    ids.push(r.id);
  }
  return { p, ids };
}

describe('ids and annotation', () => {
  it('creates deterministic ids', () => {
    expect(nextId('w', {})).toBe('w1');
    expect(nextId('w', { w1: 1, w3: 1 })).toBe('w4');
    expect(nextId('w', { w2: 1 })).toBe('w3');
  });

  it('assigns increasing references and reuses gaps', () => {
    const { p, ids } = placed([0, 0], [10, 0], [20, 0]);
    expect(ids.map((id) => p.schematic.instances[id]!.ref)).toEqual(['R1', 'R2', 'R3']);
    const after = deleteSelection(p, { instances: [ids[1]!], wires: [], labels: [] });
    const r = placePart(after, lib, 'RES', [0, 10]);
    expect(r.project.schematic.instances[r.id]!.ref).toBe('R2');
  });

  it('annotates "?" and duplicate references in reading order', () => {
    let { p, ids } = placed([0, 10], [0, 0], [10, 0]);
    p = setRef(p, ids[0]!, 'R?');
    p = setRef(p, ids[2]!, 'R2');
    const a = annotate(p);
    expect(a.schematic.instances[ids[1]!]!.ref).toBe('R2');
    // R2 kept by the earlier id; the duplicate gets the next free number
    expect(ids.map((id) => a.schematic.instances[id]!.ref).sort()).toEqual(['R1', 'R2', 'R3']);
    expect(annotate(a)).toBe(a);
  });

  it('never annotates power symbols', () => {
    const r = placePart(emptyProject(), lib, 'GND', [0, 0]);
    expect(annotate(r.project)).toBe(r.project);
    expect(r.project.schematic.instances[r.id]!.ref).toBe('#PWR');
  });
});

describe('schematic edits', () => {
  it('embeds the part, its symbol and footprints', () => {
    const { p } = placed([0, 0]);
    expect(Object.keys(p.library.parts)).toEqual(['RES']);
    expect(Object.keys(p.library.symbols)).toEqual(['R']);
    expect(Object.keys(p.library.footprints).sort()).toEqual(['R_LONG', 'R_SHORT']);
    expect(() => embedPart(p, lib, 'NOPE')).toThrow(/Unknown part/);
  });

  it('reports broken library references', () => {
    const broken = { ...lib, parts: { X: { ...lib.parts.RES!, id: 'X', symbolId: 'NOPE' } } };
    expect(() => embedPart(emptyProject(), broken, 'X')).toThrow(/unknown symbol/);
    const broken2 = { ...lib, parts: { X: { ...lib.parts.RES!, id: 'X', variants: [{ footprintId: 'NOPE', pinMap: {} }] } } };
    expect(() => embedPart(emptyProject(), broken2, 'X')).toThrow(/unknown footprint/);
  });

  it('sets value, rotation and mirror', () => {
    let { p, ids } = placed([0, 0]);
    const id = ids[0]!;
    p = setValue(p, id, '4k7');
    p = rotateInstance(p, id);
    p = rotateInstance(p, id);
    p = mirrorInstance(p, id);
    expect(p.schematic.instances[id]).toMatchObject({ value: '4k7', rotation: 180, mirror: true });
    for (let i = 0; i < 2; i++) p = rotateInstance(p, id);
    expect(p.schematic.instances[id]!.rotation).toBe(0);
    expect(rotateInstance(p, 'nope')).toBe(p);
    expect(mirrorInstance(p, 'nope')).toBe(p);
    expect(setValue(p, 'nope', 'x')).toBe(p);
  });

  it('moves parts and drags attached wire ends along', () => {
    let { p, ids } = placed([0, 0]);
    const w1 = addWire(p, [3, 0], [10, 0]);
    const w2 = addWire(w1.project, [20, 0], [30, 0]);
    const l = addLabel(w2.project, [10, 0], 'N');
    p = moveSelection(l.project, { instances: [ids[0]!], wires: [w2.id!], labels: [l.id] }, [0, 5]);
    expect(p.schematic.instances[ids[0]!]!.at).toEqual([0, 5]);
    expect(p.schematic.wires[w1.id!]).toMatchObject({ a: [3, 5], b: [10, 0] });
    expect(p.schematic.wires[w2.id!]).toMatchObject({ a: [20, 5], b: [30, 5] });
    expect(p.schematic.labels[l.id]!.at).toEqual([10, 5]);
    expect(moveSelection(p, { instances: [ids[0]!], wires: [], labels: [] }, [0, 0])).toBe(p);
  });

  it('ignores zero-length and duplicate wires', () => {
    const { p } = placed();
    expect(addWire(p, [1, 1], [1, 1]).id).toBeNull();
    const w = addWire(p, [0, 0], [5, 0]);
    expect(addWire(w.project, [5, 0], [0, 0]).id).toBeNull();
  });

  it('adds, renames and deletes labels', () => {
    let { p } = placed();
    const r = addLabel(p, [0, 0], '  VCC ');
    p = r.project;
    expect(p.schematic.labels[r.id]!.name).toBe('VCC');
    p = renameLabel(p, r.id, 'VDD');
    expect(p.schematic.labels[r.id]!.name).toBe('VDD');
    expect(renameLabel(p, r.id, '  ')).toBe(p);
    p = deleteSelection(p, { instances: [], wires: [], labels: [r.id] });
    expect(p.schematic.labels).toEqual({});
  });
});

describe('layout edits', () => {
  it('translates, rotates and resets placements', () => {
    let { p, ids } = placed([0, 0]);
    const id = ids[0]!;
    p = translate(p, id, [1, 2, 3]);
    expect(getTransform(p, id)!.position).toEqual([1, 2, 3]);
    p = rotate(p, id, [0, 1, 0], 90);
    expect(getTransform(p, id)!.rotation[1]).toBeCloseTo(Math.SQRT1_2);
    p = resetRotation(p, id);
    expect(getTransform(p, id)!.rotation).toEqual([0, 0, 0, 1]);
    expect(translate(p, 'nope', [1, 0, 0])).toBe(p);
    expect(rotate(p, 'nope', [1, 0, 0], 1)).toBe(p);
    expect(resetRotation(p, 'nope')).toBe(p);
    expect(setTransform(p, 'nope', { position: [0, 0, 0] })).toBe(p);
  });

  it('cycles footprint variants with wrap-around (like the old F key)', () => {
    let { p, ids } = placed([0, 0]);
    const id = ids[0]!;
    p = cycleVariant(p, id);
    expect(p.layout.placements[id]!.variant).toBe(1);
    p = cycleVariant(p, id);
    expect(p.layout.placements[id]!.variant).toBe(0);
    expect(cycleVariant(p, 'nope')).toBe(p);
  });

  it('inserts, reshapes, moves and removes freeform wires', () => {
    let { p, ids } = placed([0, 0]);
    const r = insertLayoutWire(p, lib, { instanceId: ids[0]!, pin: '1' }, [1, 1, 1]);
    p = r.project;
    const id = r.id!;
    expect(p.layout.wires[id]).toMatchObject({ footprintId: 'WIRE_A', position: [1, 1, 1] });
    p = cycleVariant(p, id);
    expect(p.layout.wires[id]!.footprintId).toBe('WIRE_B');
    p = cycleVariant(p, id);
    expect(p.layout.wires[id]!.footprintId).toBe('WIRE_A');
    p = translate(p, id, [1, 0, 0]);
    expect(p.layout.wires[id]!.position).toEqual([2, 1, 1]);
    p = removeLayoutWire(p, id);
    expect(p.layout.wires).toEqual({});
    expect(removeLayoutWire(p, id)).toBe(p);
  });

  it('cannot insert a wire without wire footprints', () => {
    const { p, ids } = placed([0, 0]);
    const noWires = { ...lib, footprints: { R_LONG: lib.footprints.R_LONG! } };
    expect(insertLayoutWire(p, noWires, { instanceId: ids[0]!, pin: '1' }, [0, 0, 0]).id).toBeNull();
  });
});

describe('library maintenance', () => {
  it('prunes unused embedded items', () => {
    let { p, ids } = placed([0, 0]);
    p = embedPart(p, lib, 'DIODE');
    const w = insertLayoutWire(p, lib, { instanceId: ids[0]!, pin: '1' }, [0, 0, 0]);
    const pruned = pruneLibrary(w.project);
    expect(Object.keys(pruned.library.parts)).toEqual(['RES']);
    expect(Object.keys(pruned.library.footprints).sort()).toEqual(['R_LONG', 'R_SHORT', 'WIRE_A']);
  });

  it('updates embedded parts from a newer library version', () => {
    const { p } = placed([0, 0]);
    const newer = { ...lib, parts: { ...lib.parts, RES: { ...lib.parts.RES!, description: 'updated' } } };
    expect(updateFromLibrary(p, newer).library.parts.RES!.description).toBe('updated');
    const unrelated = { symbols: {}, footprints: {}, parts: {} };
    expect(updateFromLibrary(p, unrelated)).toEqual(p);
  });
});
