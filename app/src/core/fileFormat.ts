/** Loading and saving of project and library files, including migration of older formats.
 *
 * Every format version ever released must keep loading: the golden corpus in fixtures/ is
 * loaded by the test suite on every build.
 */
import { z } from 'zod';
import { round, round3, type Quat, type Vec2 } from './geometry';
import { syncLayout } from './layout';
import { CURRENT_FORMAT_VERSION, emptyProject, librarySchema, projectSchema, type LibrarySet, type Library, type Project, type SymbolInstance } from './model';
import { embedPart, nextId, pruneLibrary } from './commands';
import { instancePinPoints, naturalCompare } from './netlist';

export class FileFormatError extends Error {}

// ------------------------------------------------------------------ legacy (v0.1.x .ffps)

/** Format written by tools/convert_legacy.py from a v0.1.x .ffps pickle. Coordinates are
 * already converted into the right-handed Y-up frame. */
export const legacyProjectSchema = z.object({
  formatVersion: z.literal(0),
  kind: z.literal('freeform-planner-legacy'),
  components: z.record(
    z.string(),
    z.object({
      value: z.string(),
      footprint: z.number().int().nonnegative(),
      /** footprint class name; v0.1.x footprint indices are per part, so wires need the name */
      footprintId: z.string().nullable().optional(),
      position: z.tuple([z.number(), z.number(), z.number()]),
      rotation: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    }),
  ),
  /** net name -> { designator or WIREn_k : pin } */
  nets: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number()]))),
});
export type LegacyProject = z.infer<typeof legacyProjectSchema>;

const LEGACY_COLUMNS = 6;
const LEGACY_SPACING: Vec2 = [24, 20];

/** Old projects have no schematic. One is generated: every part is placed on a grid and each
 * connected pin gets a net label carrying the old net name, which reproduces the exact nets. */
export function migrateLegacy(legacy: LegacyProject, library: LibrarySet, name = 'Imported project'): LoadResult {
  let project = emptyProject(name);
  const designators = Object.keys(legacy.components)
    .filter((d) => legacy.components[d]!.value !== 'WIRE')
    .sort(naturalCompare);
  const idOf = new Map<string, string>();
  const warnings: string[] = [];

  designators.forEach((designator, n) => {
    const c = legacy.components[designator]!;
    const part = library.parts[c.value];
    if (!part) {
      warnings.push(`no library part "${c.value}" for ${designator}, skipped`);
      return;
    }
    project = embedPart(project, library, part.id);
    const id = nextId('i', project.schematic.instances);
    const at: Vec2 = [(n % LEGACY_COLUMNS) * LEGACY_SPACING[0], Math.floor(n / LEGACY_COLUMNS) * LEGACY_SPACING[1]];
    const instance: SymbolInstance = { id, partId: part.id, ref: designator, value: part.defaultValue, at, rotation: 0, mirror: false };
    project.schematic.instances[id] = instance;
    project.layout.placements[id] = {
      position: round3(c.position),
      rotation: c.rotation.map((v) => round(v)) as Quat,
      variant: Math.min(c.footprint, part.variants.length - 1),
    };
    idOf.set(designator, id);
  });

  const netNames = Object.keys(legacy.nets).sort(naturalCompare);
  for (const net of netNames) {
    if (net.includes('unconnected')) continue;
    const members = legacy.nets[net]!;
    let anchor: { instanceId: string; pin: string } | undefined;
    for (const designator of Object.keys(members).sort(naturalCompare)) {
      const id = idOf.get(designator);
      if (!id) continue;
      const instance = project.schematic.instances[id]!;
      const symbol = project.library.symbols[project.library.parts[instance.partId]!.symbolId]!;
      const pin = String(members[designator]);
      const point = instancePinPoints(instance, symbol).find((p) => p.pin === pin)?.point;
      if (!point) {
        warnings.push(`${designator} has no pin ${pin}`);
        continue;
      }
      const labelId = nextId('l', project.schematic.labels);
      project.schematic.labels[labelId] = { id: labelId, at: point, name: net };
      anchor ??= { instanceId: id, pin };
    }
    // freeform wires are stored as WIREn_1 / WIREn_2 members of the net
    const wireNames = new Set(
      Object.keys(members)
        .filter((k) => /^WIRE\d+_\d+$/.test(k))
        .map((k) => k.slice(0, k.lastIndexOf('_'))),
    );
    for (const wireName of [...wireNames].sort(naturalCompare)) {
      const c = legacy.components[wireName];
      if (!c || !anchor) continue;
      const shapes = Object.values(library.footprints)
        .filter((f) => f.isWire)
        .sort((a, b) => naturalCompare(a.id, b.id));
      const footprint = (c.footprintId ? library.footprints[c.footprintId] : undefined) ?? shapes[c.footprint] ?? shapes[0];
      if (!footprint) continue;
      for (const f of shapes) project.library.footprints[f.id] = f;
      const id = nextId('lw', project.layout.wires);
      project.layout.wires[id] = {
        id,
        footprintId: footprint.id,
        position: round3(c.position),
        rotation: c.rotation.map((v) => round(v)) as Quat,
        netAnchor: anchor,
      };
    }
  }
  return { project: syncLayout(project), warnings };
}

// ------------------------------------------------------------------ public API

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

export interface LoadResult {
  project: Project;
  /** non fatal problems, e.g. parts that could not be resolved during migration */
  warnings: string[];
}

/** Parses any supported project file version and returns a current-version project. */
export function loadProject(data: unknown, library: LibrarySet): LoadResult {
  if (typeof data !== 'object' || data === null) throw new FileFormatError('Not a project file.');
  const version = (data as { formatVersion?: unknown }).formatVersion;
  if (version === 0) {
    const legacy = legacyProjectSchema.safeParse(data);
    if (!legacy.success) throw new FileFormatError(`Invalid legacy project:\n${formatIssues(legacy.error)}`);
    return migrateLegacy(legacy.data, library);
  }
  if (typeof version === 'number' && version > CURRENT_FORMAT_VERSION) {
    throw new FileFormatError(`This project was saved by a newer version (format ${version}). Please update Freeform-Planner.`);
  }
  const parsed = projectSchema.safeParse(data);
  if (!parsed.success) throw new FileFormatError(`Invalid project file:\n${formatIssues(parsed.error)}`);
  return { project: syncLayout(parsed.data), warnings: [] };
}

export function loadProjectText(text: string, library: LibrarySet): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new FileFormatError('The file is not valid JSON.');
  }
  return loadProject(data, library);
}

export function saveProjectText(project: Project): string {
  return JSON.stringify(pruneLibrary(project), null, 1) + '\n';
}

export function loadLibrary(data: unknown): Library {
  if (typeof data === 'object' && data !== null) {
    const version = (data as { formatVersion?: unknown }).formatVersion;
    if (typeof version === 'number' && version > CURRENT_FORMAT_VERSION) {
      throw new FileFormatError(`This library was saved by a newer version (format ${version}).`);
    }
  }
  const parsed = librarySchema.safeParse(data);
  if (!parsed.success) throw new FileFormatError(`Invalid library file:\n${formatIssues(parsed.error)}`);
  return parsed.data;
}

export function saveLibraryText(library: Library): string {
  return JSON.stringify(library, null, 1) + '\n';
}
