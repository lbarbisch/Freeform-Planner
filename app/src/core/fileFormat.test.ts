import { describe, expect, it } from 'vitest';
import { addWire, placePart } from './commands';
import { FileFormatError, loadLibrary, loadProject, loadProjectText, saveLibraryText, saveProjectText } from './fileFormat';
import { emptyLibrary, emptyProject } from './model';
import { testLibrary } from './testing';

const lib = testLibrary();

describe('project files', () => {
  it('round-trips through JSON', () => {
    let p = placePart(emptyProject('demo'), lib, 'RES', [0, 0]).project;
    p = placePart(p, lib, 'RES', [10, 0]).project;
    p = addWire(p, [3, 0], [7, 0]).project;
    const loaded = loadProjectText(saveProjectText(p), lib);
    expect(loaded.project).toEqual(p);
    expect(loaded.warnings).toEqual([]);
  });

  it('prunes unused library items on save', () => {
    const p = placePart(emptyProject(), lib, 'RES', [0, 0]).project;
    const withExtra = { ...p, library: { ...p.library, parts: { ...p.library.parts, DIODE: lib.parts.DIODE! } } };
    expect(JSON.parse(saveProjectText(withExtra)).library.parts).not.toHaveProperty('DIODE');
  });

  it('rejects garbage with a readable error', () => {
    expect(() => loadProjectText('not json', lib)).toThrow(FileFormatError);
    expect(() => loadProject(null, lib)).toThrow(/Not a project/);
    expect(() => loadProject({ formatVersion: 1, kind: 'freeform-planner-project' }, lib)).toThrow(/Invalid project file/);
    expect(() => loadProject({ formatVersion: 0 }, lib)).toThrow(/Invalid legacy project/);
  });

  it('refuses files from newer versions', () => {
    expect(() => loadProject({ ...emptyProject(), formatVersion: 99 }, lib)).toThrow(/newer version/);
  });
});

describe('library files', () => {
  it('round-trips', () => {
    const l = { ...emptyLibrary('mine'), ...lib };
    expect(loadLibrary(JSON.parse(saveLibraryText(l)))).toEqual(l);
  });

  it('applies defaults and rejects invalid data', () => {
    const minimal = {
      ...emptyLibrary(),
      symbols: { S: { id: 'S', name: 'S', refPrefix: 'U', graphics: [], pins: [] } },
    };
    expect(loadLibrary(minimal).symbols.S).toMatchObject({ refAt: [0, -3], showPinNumbers: true, power: false });
    expect(() => loadLibrary({ ...emptyLibrary(), formatVersion: 5 })).toThrow(/newer version/);
    expect(() => loadLibrary({ kind: 'x' })).toThrow(/Invalid library/);
    expect(() => loadLibrary(42)).toThrow(/Invalid library/);
  });
});

describe('legacy projects', () => {
  const legacy = {
    formatVersion: 0,
    kind: 'freeform-planner-legacy',
    components: {
      R1: { value: 'RES', footprint: 1, position: [1, 2, 3], rotation: [0, 0, 0, 1] },
      R2: { value: 'RES', footprint: 7, position: [4, 5, 6], rotation: [0, 0, 0, 1] },
      X1: { value: 'UNKNOWN', footprint: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      WIRE0: { value: 'WIRE', footprint: 0, footprintId: 'WIRE_B', position: [7, 7, 7], rotation: [0, 0, 0, 1] },
    },
    nets: {
      N1: { R1: '2', R2: '1', WIRE0_1: 1, WIRE0_2: 2 },
      'unconnected-(R1-Pad1)': { R1: '1' },
      N2: { R2: '5' },
    },
  };

  it('generates a schematic with labels that reproduces the nets', () => {
    const { project, warnings } = loadProject(legacy, lib);
    const refs = Object.values(project.schematic.instances).map((i) => i.ref);
    expect(refs).toEqual(['R1', 'R2']);
    expect(Object.values(project.schematic.labels).map((l) => l.name)).toEqual(['N1', 'N1']);
    expect(warnings.join()).toMatch(/UNKNOWN/);
    expect(warnings.join()).toMatch(/R2 has no pin 5/);

    const [i1, i2] = Object.keys(project.schematic.instances);
    expect(project.layout.placements[i1!]).toEqual({ position: [1, 2, 3], rotation: [0, 0, 0, 1], variant: 1 });
    // out of range footprint index is clamped
    expect(project.layout.placements[i2!]!.variant).toBe(1);
    const wire = Object.values(project.layout.wires)[0]!;
    expect(wire).toMatchObject({ footprintId: 'WIRE_B', position: [7, 7, 7], netAnchor: { instanceId: i1, pin: '2' } });
  });
});
