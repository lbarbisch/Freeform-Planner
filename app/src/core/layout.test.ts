import { describe, expect, it } from 'vitest';
import { addWire, cycleVariant, deleteSelection, insertLayoutWire, placePart, setTransform } from './commands';
import { quatFromAxisAngle } from './geometry';
import { computeAirwires, kruskalMst, layoutWireLabel, pinWorldPosition, stagingSlot, syncLayout } from './layout';
import { emptyProject, type Project } from './model';
import { testLibrary } from './testing';

const lib = testLibrary();

describe('kruskalMst', () => {
  it('returns nothing for fewer than two points', () => {
    expect(kruskalMst([])).toEqual([]);
    expect(kruskalMst([[0, 0, 0]])).toEqual([]);
  });

  it('connects the closest points first', () => {
    expect(kruskalMst([[0, 0, 0], [10, 0, 0], [1, 0, 0]])).toEqual([[0, 2], [1, 2]]);
  });

  it('honours preconnected pairs without returning them', () => {
    // 0-1 are joined by a wire; only one more edge is needed
    expect(kruskalMst([[0, 0, 0], [100, 0, 0], [101, 0, 0]], [[0, 1]])).toEqual([[1, 2]]);
    // fully preconnected: nothing to draw
    expect(kruskalMst([[0, 0, 0], [5, 0, 0]], [[0, 1]])).toEqual([]);
  });
});

function twoResistors(): { p: Project; a: string; b: string } {
  let p = emptyProject();
  const r1 = placePart(p, lib, 'RES', [0, 0]);
  const r2 = placePart(r1.project, lib, 'RES', [10, 0]);
  p = addWire(r2.project, [3, 0], [7, 0]).project;
  return { p, a: r1.id, b: r2.id };
}

describe('syncLayout', () => {
  it('places new parts on the staging grid, skipping occupied slots', () => {
    const { p, a, b } = twoResistors();
    expect(p.layout.placements[a]!.position).toEqual(stagingSlot(0));
    expect(p.layout.placements[b]!.position).toEqual(stagingSlot(1));
    expect(stagingSlot(10)).toEqual([0, 0, 15]);
  });

  it('does not place power symbols', () => {
    const r = placePart(emptyProject(), lib, 'GND', [0, 0]);
    expect(r.project.layout.placements).toEqual({});
  });

  it('removes placements and anchored wires of deleted parts', () => {
    const { p, a, b } = twoResistors();
    const withWire = insertLayoutWire(p, lib, { instanceId: a, pin: '2' }, [0, 0, 0]).project;
    const after = deleteSelection(withWire, { instances: [a], wires: [], labels: [] });
    expect(Object.keys(after.layout.placements)).toEqual([b]);
    expect(after.layout.wires).toEqual({});
  });

  it('returns the same object when nothing changes', () => {
    const { p } = twoResistors();
    expect(syncLayout(p)).toBe(p);
  });

  it('clamps variants that no longer exist', () => {
    const { p, a } = twoResistors();
    const moved = cycleVariant(p, a);
    const shrunk: Project = {
      ...moved,
      library: { ...moved.library, parts: { ...moved.library.parts, RES: { ...moved.library.parts.RES!, variants: moved.library.parts.RES!.variants.slice(0, 1) } } },
    };
    expect(syncLayout(shrunk).layout.placements[a]!.variant).toBe(0);
  });
});

describe('pin positions and airwires', () => {
  it('follows position, rotation and variant', () => {
    let { p, a } = twoResistors();
    p = setTransform(p, a, { position: [100, 0, 0], rotation: quatFromAxisAngle([0, 1, 0], 90) });
    const pos = pinWorldPosition(p, a, '1')!;
    expect(pos[0]).toBeCloseTo(100);
    expect(pos[2]).toBeCloseTo(-10);
    p = cycleVariant(p, a); // R_SHORT: pins at ±2
    expect(pinWorldPosition(p, a, '1')![2]).toBeCloseTo(-2);
    expect(pinWorldPosition(p, 'missing', '1')).toBeUndefined();
  });

  it('follows the variant pin map', () => {
    const r = placePart(emptyProject(), lib, 'DIODE', [0, 0]);
    // symbol pin 1 maps to footprint pin 2 at (-2, 0, 0)
    expect(pinWorldPosition(r.project, r.id, '1')).toEqual([-2, 0, 0]);
  });

  it('draws one airwire per connection and updates when parts move', () => {
    let { p, a, b } = twoResistors();
    let wires = computeAirwires(p);
    expect(wires).toHaveLength(1);
    expect(wires[0]).toMatchObject({ net: 'Net-(R1-2)', from: { label: 'R1', pin: '2' }, to: { label: 'R2', pin: '1' } });
    p = setTransform(p, b, { position: [50, 0, 0] });
    wires = computeAirwires(p);
    expect(wires[0]!.to.position).toEqual([60, 0, 0]);
    expect(a).toBeDefined();
  });

  it('routes through freeform wires: both wire pins count as connected', () => {
    let { p, a } = twoResistors();
    // R1.2 at (-10,0,0), R2.1 at (25,0,0); wire WIRE_A pins at x±5 placed at 7.5 -> 12.5 / 2.5
    const r = insertLayoutWire(p, lib, { instanceId: a, pin: '2' }, [7.5, 0, 0]);
    p = r.project;
    const wires = computeAirwires(p);
    expect(wires).toHaveLength(2);
    expect(wires.every((w) => w.from.owner !== w.to.owner)).toBe(true);
    expect(wires.some((w) => w.from.label === 'WIRE1' || w.to.label === 'WIRE1')).toBe(true);
    expect(layoutWireLabel(p, r.id!)).toBe('WIRE1');
  });

  it('ignores wires whose anchor pin is gone', () => {
    let { p, a } = twoResistors();
    p = insertLayoutWire(p, lib, { instanceId: a, pin: '9' }, [0, 0, 0]).project;
    expect(computeAirwires(p)).toHaveLength(1);
  });
});
