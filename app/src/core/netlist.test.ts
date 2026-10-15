import { describe, expect, it } from 'vitest';
import { addLabel, addWire, placePart } from './commands';
import { emptyProject, type Project } from './model';
import { deriveNetlist, junctionPoints, naturalCompare } from './netlist';
import { testLibrary } from './testing';

const lib = testLibrary();

/** Places parts and returns the project plus their ids. Resistor pins are at at±(3,0). */
function withParts(...positions: [number, number][]): { p: Project; ids: string[] } {
  let p = emptyProject();
  const ids: string[] = [];
  for (const at of positions) {
    const r = placePart(p, lib, 'RES', at);
    p = r.project;
    ids.push(r.id);
  }
  return { p, ids };
}

const netNodes = (p: Project) =>
  deriveNetlist(p).nets.map((n) => ({ name: n.name, nodes: n.nodes.map((x) => `${p.schematic.instances[x.instanceId]!.ref}.${x.pin}`) }));

describe('deriveNetlist', () => {
  it('gives every unconnected pin its own auto-named net', () => {
    const { p } = withParts([0, 0]);
    expect(netNodes(p)).toEqual([
      { name: 'Net-(R1-1)', nodes: ['R1.1'] },
      { name: 'Net-(R1-2)', nodes: ['R1.2'] },
    ]);
  });

  it('connects pins through a wire', () => {
    let { p } = withParts([0, 0], [10, 0]);
    p = addWire(p, [3, 0], [7, 0]).project;
    const nets = netNodes(p);
    expect(nets).toContainEqual({ name: 'Net-(R1-2)', nodes: ['R1.2', 'R2.1'] });
    expect(nets).toHaveLength(3);
  });

  it('connects pins that touch directly', () => {
    const { p } = withParts([0, 0], [6, 0]);
    expect(netNodes(p)).toContainEqual({ name: 'Net-(R1-2)', nodes: ['R1.2', 'R2.1'] });
  });

  it('connects a wire endpoint lying on another wire (T junction) but not crossing wires', () => {
    let { p } = withParts([0, 0], [20, 0], [10, 10]);
    p = addWire(p, [3, 0], [17, 0]).project; // R1.2 - R2.1
    p = addWire(p, [7, 0], [7, 10]).project; // T into the first wire, R3.1 at (7,10)
    p = addWire(p, [13, -5], [13, 5]).project; // crosses only, dangling
    const nets = netNodes(p);
    expect(nets).toContainEqual({ name: 'Net-(R1-2)', nodes: ['R1.2', 'R2.1', 'R3.1'] });
    expect(junctionPoints(p)).toEqual([[7, 0]]);
  });

  it('connects a pin lying on a wire segment', () => {
    let { p } = withParts([0, 0], [10, -6]);
    p = addWire(p, [7, -10], [7, 10]).project; // R2.1 at (7,-6) is on this wire
    p = addWire(p, [3, 0], [7, 0]).project;
    expect(netNodes(p)).toContainEqual({ name: 'Net-(R1-2)', nodes: ['R1.2', 'R2.1'] });
  });

  it('names nets by label and joins labels with the same name', () => {
    let { p } = withParts([0, 0], [20, 20]);
    p = addLabel(p, [3, 0], 'VOUT').project;
    p = addLabel(p, [23, 20], 'VOUT').project;
    p = addLabel(p, [100, 100], 'FLOATING').project; // connects nothing
    const nets = deriveNetlist(p);
    expect(nets.nets[0]).toMatchObject({ name: 'VOUT', named: true });
    expect(nets.nets[0]!.nodes).toHaveLength(2);
    expect(nets.nets.some((n) => n.name === 'FLOATING')).toBe(false);
  });

  it('connects power symbols by value and excludes them from nodes', () => {
    let { p } = withParts([0, 0], [20, 0]);
    let r = placePart(p, lib, 'GND', [-3, 0]);
    p = r.project;
    r = placePart(p, lib, 'GND', [23, 0]);
    p = r.project;
    const nets = netNodes(p);
    expect(nets[0]).toEqual({ name: 'GND', nodes: ['R1.1', 'R2.2'] });
  });

  it('reports label conflicts and uses the first name', () => {
    let { p } = withParts([0, 0]);
    p = addLabel(p, [3, 0], 'B').project;
    p = addLabel(p, [3, 0], 'A').project;
    const nl = deriveNetlist(p);
    expect(nl.conflicts).toEqual([{ names: ['A', 'B'] }]);
    expect(nl.nets[0]!.name).toBe('A');
  });

  it('makes auto names unique when references are duplicated', () => {
    let { p, ids } = withParts([0, 0], [20, 0]);
    p = { ...p, schematic: { ...p.schematic, instances: { ...p.schematic.instances, [ids[1]!]: { ...p.schematic.instances[ids[1]!]!, ref: 'R1' } } } };
    const names = deriveNetlist(p).nets.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('ignores instances whose part is missing', () => {
    let { p, ids } = withParts([0, 0]);
    p = { ...p, schematic: { ...p.schematic, instances: { ...p.schematic.instances, x: { ...p.schematic.instances[ids[0]!]!, id: 'x', partId: 'NOPE' } } } };
    expect(deriveNetlist(p).nets).toHaveLength(2);
    expect(junctionPoints(p)).toEqual([]);
  });

  it('sorts naturally', () => {
    expect(['R10', 'R2', 'R1'].sort(naturalCompare)).toEqual(['R1', 'R2', 'R10']);
  });
});
