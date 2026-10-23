/** Pure edit operations. Every function takes a project and returns a new project; nothing is
 * mutated. The UI calls these through the history store, which gives undo/redo for free. */
import { add3, quatFromAxisAngle, quatNormalize, rotateVec3, rotateWorld, samePoint, scale3, sub3, transformPoint2, type Quat, type Rotation, type Vec2, type Vec3 } from './geometry';
import { nextId } from './ids';
import { syncLayout } from './layout';
import type { LayoutWire, LibrarySet, NetLabel, PinRef, Placement, Project, SymbolInstance, Wire } from './model';
import { naturalCompare, ownerOf, symbolOf } from './netlist';
import { partInstances } from './units';

export { nextId };

// ------------------------------------------------------------------ ids & refs

export function nextRef(project: Project, prefix: string, exceptId?: string): string {
  const used = new Set(
    Object.values(project.schematic.instances)
      .filter((i) => i.id !== exceptId)
      .map((i) => i.ref),
  );
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** Re-annotates instances whose reference is missing, ends in "?" or is duplicated. */
export function annotate(project: Project): Project {
  const instances = { ...project.schematic.instances };
  const seen = new Set<string>();
  const ordered = Object.values(instances).sort((a, b) => naturalCompare(a.ref, b.ref) || naturalCompare(a.id, b.id));
  const needs: SymbolInstance[] = [];
  for (const inst of ordered) {
    const symbol = symbolOf(project, inst);
    // subparts take the reference of subpart A below
    if (symbol?.power || inst.parentId) continue;
    if (!inst.ref || inst.ref.endsWith('?') || seen.has(inst.ref)) needs.push(inst);
    else seen.add(inst.ref);
  }
  // assign in reading order (top to bottom, left to right) like most editors do
  needs.sort((a, b) => a.at[1] - b.at[1] || a.at[0] - b.at[0]);
  for (const inst of needs) {
    const prefix = symbolOf(project, inst)?.refPrefix ?? 'U';
    let n = 1;
    while (seen.has(`${prefix}${n}`)) n++;
    const ref = `${prefix}${n}`;
    seen.add(ref);
    instances[inst.id] = { ...inst, ref };
  }
  let changed = needs.length > 0;
  for (const inst of Object.values(instances)) {
    const main = inst.parentId ? instances[inst.parentId] : undefined;
    if (main && main.ref !== inst.ref) {
      instances[inst.id] = { ...inst, ref: main.ref };
      changed = true;
    }
  }
  if (!changed) return project;
  return { ...project, schematic: { ...project.schematic, instances } };
}

// ------------------------------------------------------------------ library embedding

/** Copies a part with its symbol and footprints from a library into the project. */
export function embedPart(project: Project, library: LibrarySet, partId: string): Project {
  const part = library.parts[partId];
  if (!part) throw new Error(`Unknown part "${partId}"`);
  const symbol = library.symbols[part.symbolId];
  if (!symbol) throw new Error(`Part "${partId}" references unknown symbol "${part.symbolId}"`);
  const footprints = { ...project.library.footprints };
  for (const v of part.variants) {
    const fp = library.footprints[v.footprintId];
    if (!fp) throw new Error(`Part "${partId}" references unknown footprint "${v.footprintId}"`);
    footprints[fp.id] = fp;
  }
  return {
    ...project,
    library: {
      parts: { ...project.library.parts, [part.id]: part },
      symbols: { ...project.library.symbols, [symbol.id]: symbol },
      footprints,
    },
  };
}

/** Replaces embedded copies by the library's current version (only items the library knows). */
export function updateFromLibrary(project: Project, library: LibrarySet): Project {
  let next = project;
  for (const partId of Object.keys(project.library.parts)) {
    if (library.parts[partId]) next = embedPart(next, library, partId);
  }
  for (const fpId of Object.keys(next.library.footprints)) {
    const fp = library.footprints[fpId];
    if (fp) next = { ...next, library: { ...next.library, footprints: { ...next.library.footprints, [fpId]: fp } } };
  }
  return syncLayout(next);
}

/** Drops embedded library items no instance or layout wire uses anymore. */
export function pruneLibrary(project: Project): Project {
  const parts: LibrarySet['parts'] = {};
  const symbols: LibrarySet['symbols'] = {};
  const footprints: LibrarySet['footprints'] = {};
  for (const inst of Object.values(project.schematic.instances)) {
    const part = project.library.parts[inst.partId];
    if (!part) continue;
    parts[part.id] = part;
    const symbol = project.library.symbols[part.symbolId];
    if (symbol) symbols[symbol.id] = symbol;
    for (const v of part.variants) {
      const fp = project.library.footprints[v.footprintId];
      if (fp) footprints[fp.id] = fp;
    }
  }
  for (const wire of Object.values(project.layout.wires)) {
    const fp = project.library.footprints[wire.footprintId];
    if (fp) footprints[fp.id] = fp;
  }
  return { ...project, library: { parts, symbols, footprints } };
}

// ------------------------------------------------------------------ schematic

/** Places a part. Multi-subpart parts get all their subparts, side by side; `ids` lists them
 * (subpart A first, its id is `id`). */
export function placePart(project: Project, library: LibrarySet, partId: string, at: Vec2, opts: { rotation?: Rotation; mirror?: boolean } = {}): { project: Project; id: string; ids: string[] } {
  let next = embedPart(project, library, partId);
  const part = next.library.parts[partId]!;
  const symbol = next.library.symbols[part.symbolId]!;
  const id = nextId('i', next.schematic.instances);
  const instance: SymbolInstance = {
    id,
    partId,
    ref: symbol.power ? `#PWR` : nextRef(next, symbol.refPrefix),
    value: part.defaultValue,
    at,
    rotation: opts.rotation ?? 0,
    mirror: opts.mirror ?? false,
  };
  next = syncLayout({ ...next, schematic: { ...next.schematic, instances: { ...next.schematic.instances, [id]: instance } } });
  return { project: next, id, ids: partInstances(next, id) };
}

function updateInstance(project: Project, id: string, patch: Partial<SymbolInstance>): Project {
  const inst = project.schematic.instances[id];
  if (!inst) return project;
  return {
    ...project,
    schematic: { ...project.schematic, instances: { ...project.schematic.instances, [id]: { ...inst, ...patch } } },
  };
}

/** Reference and value belong to the physical part, so all its subparts change together. */
function updatePart(project: Project, id: string, patch: Partial<SymbolInstance>): Project {
  return partInstances(project, id).reduce((p, x) => updateInstance(p, x, patch), project);
}

export function setRef(project: Project, id: string, ref: string): Project {
  return updatePart(project, id, { ref: ref.trim() });
}

export function setValue(project: Project, id: string, value: string): Project {
  return updatePart(project, id, { value });
}

export interface Selection {
  instances: string[];
  wires: string[];
  labels: string[];
}

export const emptySelection = (): Selection => ({ instances: [], wires: [], labels: [] });

function pinPointsOf(project: Project, ids: string[]): Vec2[] {
  const points: Vec2[] = [];
  for (const id of ids) {
    const inst = project.schematic.instances[id];
    const symbol = inst && symbolOf(project, inst);
    if (!inst || !symbol) continue;
    for (const p of symbol.pins) points.push(transformPoint2(inst.at, inst.rotation, inst.mirror, p.at));
  }
  return points;
}

const shift = (p: Vec2, d: Vec2): Vec2 => [p[0] + d[0], p[1] + d[1]];

/** Moves the selection. Wire endpoints attached to moved pins follow (rubber banding), so
 * dragging a part keeps it connected. */
export function moveSelection(project: Project, sel: Selection, delta: Vec2): Project {
  if (delta[0] === 0 && delta[1] === 0) return project;
  const attached = pinPointsOf(project, sel.instances);
  const instances = { ...project.schematic.instances };
  for (const id of sel.instances) {
    const inst = instances[id];
    if (inst) instances[id] = { ...inst, at: shift(inst.at, delta) };
  }
  const movingWires = new Set(sel.wires);
  const wires: Record<string, Wire> = {};
  for (const w of Object.values(project.schematic.wires)) {
    if (movingWires.has(w.id)) {
      wires[w.id] = { ...w, a: shift(w.a, delta), b: shift(w.b, delta) };
    } else {
      const moveA = attached.some((p) => samePoint(p, w.a));
      const moveB = attached.some((p) => samePoint(p, w.b));
      wires[w.id] = moveA || moveB ? { ...w, a: moveA ? shift(w.a, delta) : w.a, b: moveB ? shift(w.b, delta) : w.b } : w;
    }
  }
  const labels = { ...project.schematic.labels };
  for (const id of sel.labels) {
    const l = labels[id];
    if (l) labels[id] = { ...l, at: shift(l.at, delta) };
  }
  return { ...project, schematic: { instances, wires, labels } };
}

export function rotateInstance(project: Project, id: string): Project {
  const inst = project.schematic.instances[id];
  if (!inst) return project;
  return updateInstance(project, id, { rotation: ((inst.rotation + 90) % 360) as Rotation });
}

export function setRotation(project: Project, id: string, rotation: Rotation): Project {
  const inst = project.schematic.instances[id];
  if (!inst || inst.rotation === rotation) return project;
  return updateInstance(project, id, { rotation });
}

export function mirrorInstance(project: Project, id: string): Project {
  const inst = project.schematic.instances[id];
  if (!inst) return project;
  return updateInstance(project, id, { mirror: !inst.mirror });
}

/** Deletes the selection. Deleting one subpart of a part deletes all of its subparts. */
export function deleteSelection(project: Project, sel: Selection): Project {
  const instances = { ...project.schematic.instances };
  const wires = { ...project.schematic.wires };
  const labels = { ...project.schematic.labels };
  const owners = new Set(sel.instances.map((id) => instances[id]).filter((i) => i !== undefined).map(ownerOf));
  for (const inst of Object.values(project.schematic.instances)) if (owners.has(ownerOf(inst))) delete instances[inst.id];
  for (const id of sel.wires) delete wires[id];
  for (const id of sel.labels) delete labels[id];
  return syncLayout({ ...project, schematic: { instances, wires, labels } });
}

/** Adds a wire segment. Zero-length segments and exact duplicates are ignored. */
export function addWire(project: Project, a: Vec2, b: Vec2): { project: Project; id: string | null } {
  if (samePoint(a, b)) return { project, id: null };
  const dup = Object.values(project.schematic.wires).some(
    (w) => (samePoint(w.a, a) && samePoint(w.b, b)) || (samePoint(w.a, b) && samePoint(w.b, a)),
  );
  if (dup) return { project, id: null };
  const id = nextId('w', project.schematic.wires);
  const wires = { ...project.schematic.wires, [id]: { id, a, b } };
  return { project: { ...project, schematic: { ...project.schematic, wires } }, id };
}

export function addLabel(project: Project, at: Vec2, name: string): { project: Project; id: string } {
  const id = nextId('l', project.schematic.labels);
  const label: NetLabel = { id, at, name: name.trim() };
  const labels = { ...project.schematic.labels, [id]: label };
  return { project: { ...project, schematic: { ...project.schematic, labels } }, id };
}

export function setProjectName(project: Project, name: string): Project {
  const trimmed = name.trim();
  return trimmed && trimmed !== project.name ? { ...project, name: trimmed } : project;
}

export function renameLabel(project: Project, id: string, name: string): Project {
  const l = project.schematic.labels[id];
  if (!l || !name.trim()) return project;
  return { ...project, schematic: { ...project.schematic, labels: { ...project.schematic.labels, [id]: { ...l, name: name.trim() } } } };
}

// ------------------------------------------------------------------ layout

function updatePlacement(project: Project, id: string, patch: Partial<Placement>): Project {
  const p = project.layout.placements[id];
  if (!p) return project;
  return { ...project, layout: { ...project.layout, placements: { ...project.layout.placements, [id]: { ...p, ...patch } } } };
}

function updateLayoutWire(project: Project, id: string, patch: Partial<LayoutWire>): Project {
  const w = project.layout.wires[id];
  if (!w) return project;
  return { ...project, layout: { ...project.layout, wires: { ...project.layout.wires, [id]: { ...w, ...patch } } } };
}

/** A layout object is either a placed part (instance id) or a wire (layout wire id). */
export function getTransform(project: Project, id: string): { position: Vec3; rotation: Quat } | undefined {
  return project.layout.placements[id] ?? project.layout.wires[id];
}

export function setTransform(project: Project, id: string, t: { position?: Vec3; rotation?: Quat }): Project {
  const patch = { ...(t.position && { position: t.position }), ...(t.rotation && { rotation: quatNormalize(t.rotation) }) };
  if (project.layout.placements[id]) return updatePlacement(project, id, patch);
  return updateLayoutWire(project, id, patch);
}

export function translate(project: Project, id: string, delta: Vec3): Project {
  const t = getTransform(project, id);
  return t ? setTransform(project, id, { position: add3(t.position, delta) }) : project;
}

/** Rotates around a world axis through the object's origin. */
export function rotate(project: Project, id: string, axis: Vec3, degrees: number): Project {
  const t = getTransform(project, id);
  return t ? setTransform(project, id, { rotation: rotateWorld(t.rotation, axis, degrees) }) : project;
}

export function setTransforms(project: Project, transforms: Record<string, { position?: Vec3; rotation?: Quat }>): Project {
  return Object.entries(transforms).reduce((p, [id, t]) => setTransform(p, id, t), project);
}

/** Center of a group of layout objects (average of their origins). */
export function groupPivot(project: Project, ids: string[]): Vec3 | undefined {
  const positions = ids.map((id) => getTransform(project, id)?.position).filter((p) => p !== undefined);
  if (!positions.length) return undefined;
  return scale3(positions.reduce(add3, [0, 0, 0]), 1 / positions.length);
}

/** Rotates a group of layout objects around a world axis through their common center. A single
 * object rotates around its own origin. */
export function rotateGroup(project: Project, ids: string[], axis: Vec3, degrees: number): Project {
  const pivot = groupPivot(project, ids);
  if (!pivot) return project;
  const q = quatFromAxisAngle(axis, degrees);
  const transforms: Record<string, { position: Vec3; rotation: Quat }> = {};
  for (const id of ids) {
    const t = getTransform(project, id);
    if (t) transforms[id] = { position: add3(pivot, rotateVec3(q, sub3(t.position, pivot))), rotation: rotateWorld(t.rotation, axis, degrees) };
  }
  return setTransforms(project, transforms);
}

export function resetRotation(project: Project, id: string): Project {
  return getTransform(project, id) ? setTransform(project, id, { rotation: [0, 0, 0, 1] }) : project;
}

/** Selects one of the part's footprint variants. */
export function setVariant(project: Project, id: string, variant: number): Project {
  const placement = project.layout.placements[id];
  const inst = project.schematic.instances[id];
  const count = inst ? (project.library.parts[inst.partId]?.variants.length ?? 0) : 0;
  if (!placement || variant < 0 || variant >= count || variant === placement.variant) return project;
  return updatePlacement(project, id, { variant });
}

/** Cycles through the part's footprint variants (or the wire shapes for a layout wire). */
export function cycleVariant(project: Project, id: string): Project {
  const placement = project.layout.placements[id];
  if (placement) {
    const inst = project.schematic.instances[id]!;
    const count = project.library.parts[inst.partId]?.variants.length ?? 1;
    return updatePlacement(project, id, { variant: (placement.variant + 1) % Math.max(count, 1) });
  }
  const wire = project.layout.wires[id];
  if (wire) {
    const shapes = Object.values(project.library.footprints)
      .filter((f) => f.isWire)
      .map((f) => f.id)
      .sort(naturalCompare);
    if (shapes.length === 0) return project;
    const next = shapes[(shapes.indexOf(wire.footprintId) + 1) % shapes.length]!;
    return updateLayoutWire(project, id, { footprintId: next });
  }
  return project;
}

/** Wire footprints offered for layout wires: those of the library plus the ones the project
 * already embeds, sorted by id. */
export function wireFootprints(project: Project, library: LibrarySet): LibrarySet['footprints'][string][] {
  const all = { ...project.library.footprints, ...library.footprints };
  return Object.values(all)
    .filter((f) => f.isWire)
    .sort((a, b) => naturalCompare(a.id, b.id));
}

/** Gives a layout wire another wire footprint, embedding it from the library when needed. */
export function setWireFootprint(project: Project, library: LibrarySet, id: string, footprintId: string): Project {
  const wire = project.layout.wires[id];
  const fp = library.footprints[footprintId] ?? project.library.footprints[footprintId];
  if (!wire || !fp?.isWire || wire.footprintId === footprintId) return project;
  const next = project.library.footprints[footprintId] ? project : { ...project, library: { ...project.library, footprints: { ...project.library.footprints, [fp.id]: fp } } };
  return updateLayoutWire(next, id, { footprintId });
}

/** Inserts a wire into the net of `anchor`. The wire footprints come from the given
 * library and are embedded into the project. */
export function insertLayoutWire(project: Project, library: LibrarySet, anchor: PinRef, position: Vec3): { project: Project; id: string | null } {
  const shapes = Object.values(library.footprints)
    .filter((f) => f.isWire)
    .sort((a, b) => naturalCompare(a.id, b.id));
  const footprint = shapes[0];
  if (!footprint) return { project, id: null };
  const footprints = { ...project.library.footprints };
  for (const f of shapes) footprints[f.id] = f;
  const id = nextId('lw', project.layout.wires);
  const wire: LayoutWire = { id, footprintId: footprint.id, position, rotation: [0, 0, 0, 1], netAnchor: anchor };
  return {
    project: { ...project, library: { ...project.library, footprints }, layout: { ...project.layout, wires: { ...project.layout.wires, [id]: wire } } },
    id,
  };
}

export function removeLayoutWire(project: Project, id: string): Project {
  if (!project.layout.wires[id]) return project;
  const wires = { ...project.layout.wires };
  delete wires[id];
  return { ...project, layout: { ...project.layout, wires } };
}
