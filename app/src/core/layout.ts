/** 3D layout logic: pin positions, airwires and keeping placements in sync with the schematic. */
import { distance3, IDENTITY_QUAT, transformPoint, type Vec3 } from './geometry';
import type { FootprintDef, LayoutWire, PartDef, PartVariant, Placement, Project, SymbolInstance } from './model';
import { deriveNetlist, naturalCompare, pinKey, type Netlist } from './netlist';
import { UnionFind } from './unionFind';

/** Parts without footprint variants (power symbols, pure schematic items) are not placed. */
export function isPlaceable(project: Project, instance: SymbolInstance): boolean {
  const part = project.library.parts[instance.partId];
  return !!part && part.variants.length > 0;
}

export interface ResolvedPlacement {
  instance: SymbolInstance;
  part: PartDef;
  variant: PartVariant;
  footprint: FootprintDef;
  placement: Placement;
}

export function resolvePlacement(project: Project, instanceId: string): ResolvedPlacement | undefined {
  const instance = project.schematic.instances[instanceId];
  const placement = project.layout.placements[instanceId];
  if (!instance || !placement) return undefined;
  const part = project.library.parts[instance.partId];
  const variant = part?.variants[placement.variant] ?? part?.variants[0];
  const footprint = variant ? project.library.footprints[variant.footprintId] : undefined;
  if (!part || !variant || !footprint) return undefined;
  return { instance, part, variant, footprint, placement };
}

export function footprintPinWorld(footprint: FootprintDef, position: Vec3, rotation: [number, number, number, number], pin: string): Vec3 | undefined {
  const p = footprint.pins.find((fp) => fp.number === pin);
  return p ? transformPoint(position, rotation, p.position) : undefined;
}

/** World position of a schematic pin in the layout, following the variant's pin map. */
export function pinWorldPosition(project: Project, instanceId: string, symbolPin: string): Vec3 | undefined {
  const r = resolvePlacement(project, instanceId);
  if (!r) return undefined;
  const fpPin = r.variant.pinMap[symbolPin] ?? symbolPin;
  return footprintPinWorld(r.footprint, r.placement.position, r.placement.rotation, fpPin);
}

// ------------------------------------------------------------------ airwires

/** Kruskal minimum spanning tree over points. `preconnected` index pairs are treated as existing
 * edges (they count towards spanning the tree but are not returned). */
export function kruskalMst(points: Vec3[], preconnected: [number, number][] = []): [number, number][] {
  const n = points.length;
  if (n < 2) return [];
  const edges: { d: number; i: number; j: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) edges.push({ d: distance3(points[i]!, points[j]!), i, j });
  }
  // stable sort keeps results deterministic for equal distances
  edges.sort((a, b) => a.d - b.d);
  const uf = new UnionFind();
  let preCount = 0;
  for (const [i, j] of preconnected) if (uf.union(String(i), String(j))) preCount++;
  const result: [number, number][] = [];
  for (const { i, j } of edges) {
    if (result.length + preCount >= n - 1) break;
    if (uf.union(String(i), String(j))) result.push([i, j]);
  }
  return result;
}

export interface LayoutNode {
  /** instance id, or layout wire id */
  owner: string;
  /** display reference, e.g. "R1" or "WIRE2" */
  label: string;
  pin: string;
  position: Vec3;
}

export interface Airwire {
  net: string;
  from: LayoutNode;
  to: LayoutNode;
}

/** Index of the net a layout wire belongs to, or undefined when its anchor no longer exists. */
export function netOfLayoutWire(netlist: Netlist, wire: LayoutWire): number | undefined {
  return netlist.netOfPin.get(pinKey(wire.netAnchor));
}

export function layoutWireLabel(project: Project, wireId: string): string {
  const ids = Object.keys(project.layout.wires).sort(naturalCompare);
  return `WIRE${ids.indexOf(wireId) + 1}`;
}

/** Pins closer than this (mm) touch and count as connected: no airwire is drawn between them. */
export const TOUCH_DISTANCE = 0.01;

export function computeAirwires(project: Project, netlist: Netlist = deriveNetlist(project)): Airwire[] {
  const result: Airwire[] = [];
  const wiresByNet = new Map<number, LayoutWire[]>();
  for (const wire of Object.values(project.layout.wires)) {
    const idx = netOfLayoutWire(netlist, wire);
    if (idx === undefined) continue;
    const list = wiresByNet.get(idx) ?? [];
    list.push(wire);
    wiresByNet.set(idx, list);
  }

  netlist.nets.forEach((net, idx) => {
    const nodes: LayoutNode[] = [];
    for (const n of net.nodes) {
      const pos = pinWorldPosition(project, n.instanceId, n.pin);
      if (!pos) continue;
      nodes.push({ owner: n.instanceId, label: project.schematic.instances[n.instanceId]!.ref, pin: n.pin, position: pos });
    }
    const preconnected: [number, number][] = [];
    for (const wire of (wiresByNet.get(idx) ?? []).sort((a, b) => naturalCompare(a.id, b.id))) {
      const fp = project.library.footprints[wire.footprintId];
      if (!fp || fp.pins.length < 2) continue;
      const label = layoutWireLabel(project, wire.id);
      const start = nodes.length;
      for (const p of fp.pins) {
        nodes.push({ owner: wire.id, label, pin: p.number, position: transformPoint(wire.position, wire.rotation, p.position) });
      }
      // all pins of one wire are physically connected
      for (let k = start + 1; k < nodes.length; k++) preconnected.push([start, k]);
    }
    const edges = kruskalMst(
      nodes.map((n) => n.position),
      preconnected,
    );
    for (const [i, j] of edges) {
      if (distance3(nodes[i]!.position, nodes[j]!.position) < TOUCH_DISTANCE) continue;
      result.push({ net: net.name, from: nodes[i]!, to: nodes[j]! });
    }
  });
  return result;
}

// ------------------------------------------------------------------ placement sync

const STAGING_COLUMNS = 10;
export const STAGING_SPACING = 15;

/** Position of the n-th slot of the staging grid where new parts appear (like the old posGenerator). */
export function stagingSlot(n: number): Vec3 {
  return [(n % STAGING_COLUMNS) * STAGING_SPACING, 0, Math.floor(n / STAGING_COLUMNS) * STAGING_SPACING];
}

function nextFreeSlot(occupied: Vec3[]): Vec3 {
  for (let n = 0; ; n++) {
    const slot = stagingSlot(n);
    if (!occupied.some((p) => distance3(p, slot) < STAGING_SPACING / 2)) return slot;
  }
}

/** Adds placements for new placeable instances and removes placements (and wires anchored to
 * them) of instances that no longer exist. Returns the same object when nothing changed. */
export function syncLayout(project: Project): Project {
  const { instances } = project.schematic;
  const placements = { ...project.layout.placements };
  let changed = false;

  for (const id of Object.keys(placements)) {
    const instance = instances[id];
    if (!instance || !isPlaceable(project, instance)) {
      delete placements[id];
      changed = true;
    }
  }
  const occupied = Object.values(placements).map((p) => p.position);
  const ordered = Object.values(instances).sort((a, b) => naturalCompare(a.ref, b.ref));
  for (const instance of ordered) {
    if (placements[instance.id] || !isPlaceable(project, instance)) continue;
    const position = nextFreeSlot(occupied);
    occupied.push(position);
    placements[instance.id] = { position, rotation: [...IDENTITY_QUAT], variant: 0 };
    changed = true;
  }
  // clamp variants after library updates
  for (const [id, placement] of Object.entries(placements)) {
    const part = project.library.parts[instances[id]!.partId]!;
    if (placement.variant >= part.variants.length) {
      placements[id] = { ...placement, variant: 0 };
      changed = true;
    }
  }

  const wires = { ...project.layout.wires };
  for (const [id, wire] of Object.entries(wires)) {
    if (!placements[wire.netAnchor.instanceId]) {
      delete wires[id];
      changed = true;
    }
  }
  if (!changed) return project;
  return { ...project, layout: { placements, wires } };
}
