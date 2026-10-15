/** Derives the netlist from the schematic. The netlist is never stored: it is always computed
 * from wires, labels, power symbols and pin positions, so the schematic is the single source
 * of truth for connectivity.
 *
 * Connection rules (same as common schematic editors):
 * - points that coincide are connected (pin to pin, wire end to pin, label to wire end, ...)
 * - a wire endpoint, pin or label lying on another wire connects to that wire
 * - wires that merely cross are NOT connected
 * - labels with the same name are connected, power symbols connect to the net named by their value
 */
import { pointKey, pointOnSegment, transformPoint2, type Vec2 } from './geometry';
import type { PinRef, Project, SymbolDef, SymbolInstance } from './model';
import { UnionFind } from './unionFind';

export interface Net {
  name: string;
  /** true when the name comes from a label or power symbol */
  named: boolean;
  /** pins of real (non-power) parts, sorted by reference then pin number */
  nodes: PinRef[];
}

export interface Netlist {
  nets: Net[];
  /** `${instanceId}:${pin}` -> index into nets */
  netOfPin: Map<string, number>;
  /** nets that carry more than one label name */
  conflicts: { names: string[] }[];
}

export function pinKey(ref: PinRef): string {
  return `${ref.instanceId}:${ref.pin}`;
}

/** Natural compare so that R2 sorts before R10. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

export function symbolOf(project: Project, instance: SymbolInstance): SymbolDef | undefined {
  const part = project.library.parts[instance.partId];
  return part ? project.library.symbols[part.symbolId] : undefined;
}

/** Sheet position of each pin's connection point. */
export function instancePinPoints(instance: SymbolInstance, symbol: SymbolDef): { pin: string; point: Vec2 }[] {
  return symbol.pins.map((p) => ({
    pin: p.number,
    point: transformPoint2(instance.at, instance.rotation, instance.mirror, p.at),
  }));
}

export function deriveNetlist(project: Project): Netlist {
  const { instances, wires, labels } = project.schematic;
  const uf = new UnionFind();

  // every connectable thing with its location
  const points: { item: string; point: Vec2 }[] = [];
  const pinItems: { item: string; ref: PinRef; isPower: boolean; instance: SymbolInstance }[] = [];

  for (const instance of Object.values(instances)) {
    const symbol = symbolOf(project, instance);
    if (!symbol) continue;
    for (const { pin, point } of instancePinPoints(instance, symbol)) {
      const item = `pin:${instance.id}:${pin}`;
      uf.add(item);
      points.push({ item, point });
      pinItems.push({ item, ref: { instanceId: instance.id, pin }, isPower: symbol.power, instance });
      if (symbol.power) uf.union(item, `name:${instance.value}`);
    }
  }
  for (const wire of Object.values(wires)) {
    const item = `wire:${wire.id}`;
    uf.add(item);
    points.push({ item, point: wire.a }, { item, point: wire.b });
  }
  for (const label of Object.values(labels)) {
    const item = `label:${label.id}`;
    uf.union(item, `name:${label.name}`);
    points.push({ item, point: label.at });
  }

  // coinciding points
  const byPoint = new Map<string, string>();
  for (const { item, point } of points) {
    const key = pointKey(point);
    const first = byPoint.get(key);
    if (first === undefined) byPoint.set(key, item);
    else uf.union(first, item);
  }

  // points lying on a wire (T-junctions)
  for (const wire of Object.values(wires)) {
    for (const { item, point } of points) {
      if (pointOnSegment(point, wire.a, wire.b)) uf.union(`wire:${wire.id}`, item);
    }
  }

  // group pins by root
  const groups = new Map<string, { nodes: PinRef[]; names: Set<string>; refs: Map<string, string> }>();
  const groupOf = (root: string) => {
    let g = groups.get(root);
    if (!g) {
      g = { nodes: [], names: new Set(), refs: new Map() };
      groups.set(root, g);
    }
    return g;
  };
  for (const item of uf.items()) {
    if (item.startsWith('name:')) {
      // only names that are actually attached to something create a net
      groupOf(uf.find(item)).names.add(item.slice(5));
    }
  }
  for (const { item, ref, isPower, instance } of pinItems) {
    const g = groupOf(uf.find(item));
    if (!isPower) {
      g.nodes.push(ref);
      g.refs.set(ref.instanceId, instance.ref);
    }
  }

  const nets: Net[] = [];
  const conflicts: { names: string[] }[] = [];
  const netOfPin = new Map<string, number>();
  const usedNames = new Set<string>();
  const sortedGroups = [...groups.values()].filter((g) => g.nodes.length > 0);

  for (const g of sortedGroups) {
    g.nodes.sort((a, b) => naturalCompare(g.refs.get(a.instanceId) ?? '', g.refs.get(b.instanceId) ?? '') || naturalCompare(a.pin, b.pin));
  }
  // stable output order: named nets first (by name), then by first node
  sortedGroups.sort((a, b) => {
    const an = [...a.names].sort(naturalCompare)[0];
    const bn = [...b.names].sort(naturalCompare)[0];
    if (an !== undefined && bn !== undefined) return naturalCompare(an, bn);
    if (an !== undefined) return -1;
    if (bn !== undefined) return 1;
    const a0 = a.nodes[0]!;
    const b0 = b.nodes[0]!;
    return naturalCompare(a.refs.get(a0.instanceId) ?? '', b.refs.get(b0.instanceId) ?? '') || naturalCompare(a0.pin, b0.pin);
  });

  for (const g of sortedGroups) {
    const names = [...g.names].sort(naturalCompare);
    if (names.length > 1) conflicts.push({ names });
    let name: string;
    const named = names.length > 0;
    if (named) {
      name = names[0]!;
    } else {
      const first = g.nodes[0]!;
      name = `Net-(${g.refs.get(first.instanceId)}-${first.pin})`;
    }
    // auto names may collide when references are duplicated
    let unique = name;
    for (let i = 2; usedNames.has(unique); i++) unique = `${name}_${i}`;
    usedNames.add(unique);
    const index = nets.length;
    nets.push({ name: unique, named, nodes: g.nodes });
    for (const n of g.nodes) netOfPin.set(pinKey(n), index);
  }

  return { nets, netOfPin, conflicts };
}

/** Points where three or more connections meet; drawn as a dot in the schematic. */
export function junctionPoints(project: Project): Vec2[] {
  const { instances, wires } = project.schematic;
  const counts = new Map<string, { point: Vec2; n: number }>();
  const bump = (p: Vec2, n: number) => {
    const key = pointKey(p);
    const entry = counts.get(key);
    if (entry) entry.n += n;
    else counts.set(key, { point: p, n });
  };
  const wireList = Object.values(wires);
  const candidates: Vec2[] = [];
  for (const w of wireList) {
    bump(w.a, 1);
    bump(w.b, 1);
    candidates.push(w.a, w.b);
  }
  for (const instance of Object.values(instances)) {
    const symbol = symbolOf(project, instance);
    if (!symbol) continue;
    for (const { point } of instancePinPoints(instance, symbol)) {
      bump(point, 1);
      candidates.push(point);
    }
  }
  // a wire passing through a point contributes two connections
  const seen = new Set<string>();
  for (const p of candidates) {
    const key = pointKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const w of wireList) {
      if (pointOnSegment(p, w.a, w.b) && pointKey(w.a) !== key && pointKey(w.b) !== key) bump(p, 2);
    }
  }
  return [...counts.values()].filter((c) => c.n >= 3).map((c) => c.point);
}
