/** Data model of libraries and projects.
 *
 * Everything in here is plain, serialisable data. Renderers only read it; edits go through
 * the pure functions in commands.ts. Schemas validate files when they are loaded.
 */
import { z } from 'zod';

export const CURRENT_FORMAT_VERSION = 1;

const vec2 = z.tuple([z.number(), z.number()]);
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const quat = z.tuple([z.number(), z.number(), z.number(), z.number()]);

// ------------------------------------------------------------------ library

/** Direction a pin points, from its connection point towards the symbol body. */
export const pinDirectionSchema = z.enum(['left', 'right', 'up', 'down']);
export type PinDirection = z.infer<typeof pinDirectionSchema>;

export const symbolPinSchema = z.object({
  number: z.string().min(1),
  name: z.string(),
  /** connection point, in grid units (1 unit = 1.27 mm), y grows downwards */
  at: vec2,
  dir: pinDirectionSchema,
  length: z.number().nonnegative(),
});
export type SymbolPin = z.infer<typeof symbolPinSchema>;

export const graphicSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('line'), points: z.array(vec2).min(2), fill: z.boolean().default(false) }),
  z.object({ kind: z.literal('rect'), from: vec2, to: vec2, fill: z.boolean().default(false) }),
  z.object({ kind: z.literal('circle'), center: vec2, radius: z.number().positive(), fill: z.boolean().default(false) }),
  z.object({ kind: z.literal('text'), at: vec2, text: z.string(), size: z.number().positive().default(1) }),
]);
export type Graphic = z.infer<typeof graphicSchema>;

export const symbolDefSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** reference prefix used by auto-annotation, e.g. "R" */
  refPrefix: z.string().min(1),
  graphics: z.array(graphicSchema),
  pins: z.array(symbolPinSchema),
  refAt: vec2.default([0, -3]),
  valueAt: vec2.default([0, 3]),
  showPinNumbers: z.boolean().default(true),
  showPinNames: z.boolean().default(false),
  /** power symbols (GND, +5V, ...) name their net and have no footprint */
  power: z.boolean().default(false),
});
export type SymbolDef = z.infer<typeof symbolDefSchema>;

export const modelSourceSchema = z.discriminatedUnion('kind', [
  /** model shipped with the app, path without extension relative to the app's asset folder */
  z.object({ kind: z.literal('asset'), path: z.string().min(1) }),
  /** model stored inside the library or project file */
  z.object({ kind: z.literal('embedded'), obj: z.string(), mtl: z.string().nullable() }),
  /** no model, pins only (rendered as a small placeholder) */
  z.object({ kind: z.literal('none') }),
]);
export type ModelSource = z.infer<typeof modelSourceSchema>;

export const footprintPinSchema = z.object({
  number: z.string().min(1),
  /** pin anchor in footprint space (mm, Y up) */
  position: vec3,
});
export type FootprintPin = z.infer<typeof footprintPinSchema>;

export const footprintDefSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  model: modelSourceSchema,
  /** applied to the raw model geometry to bring it into footprint space */
  modelRotation: quat.default([0, 0, 0, 1]),
  modelOffset: vec3.default([0, 0, 0]),
  modelScale: z.number().positive().default(1),
  pins: z.array(footprintPinSchema),
  /** freeform wires are layout-only objects and never appear in the schematic */
  isWire: z.boolean().default(false),
});
export type FootprintDef = z.infer<typeof footprintDefSchema>;

export const partVariantSchema = z.object({
  footprintId: z.string().min(1),
  /** symbol pin number -> footprint pin number */
  pinMap: z.record(z.string(), z.string()),
});
export type PartVariant = z.infer<typeof partVariantSchema>;

export const partDefSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().default(''),
  symbolId: z.string().min(1),
  defaultValue: z.string(),
  variants: z.array(partVariantSchema),
});
export type PartDef = z.infer<typeof partDefSchema>;

const librarySetSchema = z.object({
  symbols: z.record(z.string(), symbolDefSchema),
  footprints: z.record(z.string(), footprintDefSchema),
  parts: z.record(z.string(), partDefSchema),
});
export type LibrarySet = z.infer<typeof librarySetSchema>;

export const librarySchema = librarySetSchema.extend({
  formatVersion: z.literal(CURRENT_FORMAT_VERSION),
  kind: z.literal('freeform-planner-library'),
  name: z.string(),
});
export type Library = z.infer<typeof librarySchema>;

// ------------------------------------------------------------------ project

export const rotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

export const symbolInstanceSchema = z.object({
  id: z.string().min(1),
  partId: z.string().min(1),
  ref: z.string(),
  value: z.string(),
  at: vec2,
  rotation: rotationSchema,
  mirror: z.boolean(),
});
export type SymbolInstance = z.infer<typeof symbolInstanceSchema>;

export const wireSchema = z.object({ id: z.string().min(1), a: vec2, b: vec2 });
export type Wire = z.infer<typeof wireSchema>;

export const netLabelSchema = z.object({ id: z.string().min(1), at: vec2, name: z.string().min(1) });
export type NetLabel = z.infer<typeof netLabelSchema>;

export const schematicSchema = z.object({
  instances: z.record(z.string(), symbolInstanceSchema),
  wires: z.record(z.string(), wireSchema),
  labels: z.record(z.string(), netLabelSchema),
});
export type Schematic = z.infer<typeof schematicSchema>;

export const placementSchema = z.object({
  position: vec3,
  rotation: quat,
  /** index into the part's variants */
  variant: z.number().int().nonnegative(),
});
export type Placement = z.infer<typeof placementSchema>;

/** A pin that identifies a net independently of its (derived) name. */
export const pinRefSchema = z.object({ instanceId: z.string().min(1), pin: z.string().min(1) });
export type PinRef = z.infer<typeof pinRefSchema>;

export const layoutWireSchema = z.object({
  id: z.string().min(1),
  /** footprint of the wire (a footprint with isWire = true and two pins) */
  footprintId: z.string().min(1),
  position: vec3,
  rotation: quat,
  /** the wire belongs to the net that contains this schematic pin */
  netAnchor: pinRefSchema,
});
export type LayoutWire = z.infer<typeof layoutWireSchema>;

export const layoutSchema = z.object({
  placements: z.record(z.string(), placementSchema),
  wires: z.record(z.string(), layoutWireSchema),
});
export type Layout = z.infer<typeof layoutSchema>;

export const projectSchema = z.object({
  formatVersion: z.literal(CURRENT_FORMAT_VERSION),
  kind: z.literal('freeform-planner-project'),
  name: z.string(),
  /** copies of every library item used, so projects open identically on any machine */
  library: librarySetSchema,
  schematic: schematicSchema,
  layout: layoutSchema,
});
export type Project = z.infer<typeof projectSchema>;

export function emptyLibrarySet(): LibrarySet {
  return { symbols: {}, footprints: {}, parts: {} };
}

export function emptyProject(name = 'Untitled'): Project {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    kind: 'freeform-planner-project',
    name,
    library: emptyLibrarySet(),
    schematic: { instances: {}, wires: {}, labels: {} },
    layout: { placements: {}, wires: {} },
  };
}

export function emptyLibrary(name = 'New library'): Library {
  return { formatVersion: CURRENT_FORMAT_VERSION, kind: 'freeform-planner-library', name, ...emptyLibrarySet() };
}
