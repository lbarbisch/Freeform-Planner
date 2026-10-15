/** Wavefront OBJ + MTL writer. The 3D view collects world-space triangle meshes; this module only
 * formats them, so it can be tested without a renderer. Coordinates are right-handed, Y up, mm. */

export interface ExportMaterial {
  /** diffuse colour 0..1 */
  color: [number, number, number];
  opacity: number;
}

export interface ExportMesh {
  /** flat list of world-space vertex coordinates x0,y0,z0,x1,... */
  positions: ArrayLike<number>;
  /** triangle vertex indices into positions (0-based); omitted for non-indexed triangle lists */
  indices?: ArrayLike<number>;
  material: ExportMaterial;
}

export interface ExportGroup {
  name: string;
  meshes: ExportMesh[];
}

const fmt = (n: number) => {
  const s = n.toFixed(6);
  return s === '-0.000000' ? '0.000000' : s;
};

export function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function writeObj(groups: ExportGroup[], mtlFileName: string): { obj: string; mtl: string } {
  const obj: string[] = ['# Freeform-Planner 3D scene export', `mtllib ${mtlFileName}`];
  const mtl: string[] = ['# Freeform-Planner material library'];
  const materials = new Map<string, string>();
  let vertexOffset = 0;

  const materialName = (m: ExportMaterial): string => {
    const key = [...m.color, m.opacity].map((v) => v.toFixed(4)).join(',');
    let name = materials.get(key);
    if (!name) {
      name = `mat_${String(materials.size + 1).padStart(4, '0')}`;
      materials.set(key, name);
      const [r, g, b] = m.color;
      mtl.push('', `newmtl ${name}`, `Ka ${fmt(r * 0.2)} ${fmt(g * 0.2)} ${fmt(b * 0.2)}`, `Kd ${fmt(r)} ${fmt(g)} ${fmt(b)}`, 'Ks 0.500000 0.500000 0.500000', 'Ns 32.000000', `d ${fmt(m.opacity)}`);
    }
    return name;
  };

  for (const group of groups) {
    if (group.meshes.length === 0) continue;
    obj.push('', `g ${sanitizeName(group.name)}`);
    for (const mesh of group.meshes) {
      const count = Math.floor(mesh.positions.length / 3);
      for (let i = 0; i < count; i++) {
        obj.push(`v ${fmt(mesh.positions[i * 3]!)} ${fmt(mesh.positions[i * 3 + 1]!)} ${fmt(mesh.positions[i * 3 + 2]!)}`);
      }
      obj.push(`usemtl ${materialName(mesh.material)}`);
      const idx = mesh.indices;
      const triangles = idx ? Math.floor(idx.length / 3) : Math.floor(count / 3);
      for (let t = 0; t < triangles; t++) {
        const a = idx ? idx[t * 3]! : t * 3;
        const b = idx ? idx[t * 3 + 1]! : t * 3 + 1;
        const c = idx ? idx[t * 3 + 2]! : t * 3 + 2;
        obj.push(`f ${vertexOffset + a + 1} ${vertexOffset + b + 1} ${vertexOffset + c + 1}`);
      }
      vertexOffset += count;
    }
  }
  return { obj: obj.join('\n') + '\n', mtl: mtl.join('\n') + '\n' };
}

/** Minimal OBJ reader (vertices, faces, groups); used by tests and the footprint editor preview. */
export function parseObjSummary(text: string): { vertices: number; faces: number; groups: string[] } {
  let vertices = 0;
  let faces = 0;
  const groups: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) vertices++;
    else if (line.startsWith('f ')) faces++;
    else if (line.startsWith('g ')) groups.push(line.slice(2).trim());
  }
  return { vertices, faces, groups };
}
