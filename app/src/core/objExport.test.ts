import { describe, expect, it } from 'vitest';
import { parseObjSummary, sanitizeName, writeObj } from './objExport';

describe('writeObj', () => {
  const red = { color: [1, 0, 0] as [number, number, number], opacity: 1 };
  const tri = [0, 0, 0, 1, 0, 0, 0, 1, 0];

  it('writes groups, vertices, faces and deduplicated materials', () => {
    const { obj, mtl } = writeObj(
      [
        { name: 'R1', meshes: [{ positions: tri, material: red }] },
        { name: 'net /+5V', meshes: [{ positions: [...tri, 0, 0, 1], indices: [0, 1, 2, 0, 2, 3], material: red }] },
        { name: 'empty', meshes: [] },
      ],
      'scene.mtl',
    );
    expect(obj).toContain('mtllib scene.mtl');
    expect(obj).toContain('g net___5V');
    expect(obj).toContain('f 1 2 3');
    // vertex numbering continues across meshes
    expect(obj).toContain('f 4 5 6');
    expect(obj).toContain('f 4 6 7');
    expect(parseObjSummary(obj)).toEqual({ vertices: 7, faces: 3, groups: ['R1', 'net___5V'] });
    expect(mtl.match(/newmtl/g)).toHaveLength(1);
    expect(mtl).toContain('Kd 1.000000 0.000000 0.000000');
  });

  it('never writes negative zero', () => {
    const { obj } = writeObj([{ name: 'a', meshes: [{ positions: [-0, -0.0000001, 0], material: red }] }], 'a.mtl');
    expect(obj).toContain('v 0.000000 0.000000 0.000000');
  });

  it('sanitizes names', () => {
    expect(sanitizeName('Net-(D1-K)')).toBe('Net-_D1-K_');
  });
});
