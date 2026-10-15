import { describe, expect, it } from 'vitest';
import {
  distance3,
  pointOnSegment,
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
  rotateVec3,
  rotateWorld,
  round,
  round3,
  transformPoint,
  transformPoint2,
  type Vec3,
} from './geometry';

const close3 = (a: Vec3, b: Vec3) => expect(distance3(a, b)).toBeLessThan(1e-9);

describe('quaternions', () => {
  it('rotates +X to -Z by 90 degrees about +Y (right-handed)', () => {
    close3(rotateVec3(quatFromAxisAngle([0, 1, 0], 90), [1, 0, 0]), [0, 0, -1]);
  });

  it('composes rotations: second argument applied first', () => {
    const a = quatFromAxisAngle([0, 0, 1], 90);
    const b = quatFromAxisAngle([1, 0, 0], 90);
    const v: Vec3 = [0, 1, 0];
    close3(rotateVec3(quatMultiply(a, b), v), rotateVec3(a, rotateVec3(b, v)));
  });

  it('rotateWorld applies the new rotation after the existing one', () => {
    const q = rotateWorld(quatFromAxisAngle([0, 0, 1], 90), [0, 1, 0], 90);
    // +X -> (Z 90) -> +Y -> (Y 90) -> +Y
    close3(rotateVec3(q, [1, 0, 0]), [0, 1, 0]);
  });

  it('normalizes and handles the zero quaternion', () => {
    expect(quatNormalize([0, 0, 0, 2])).toEqual([0, 0, 0, 1]);
    expect(quatNormalize([0, 0, 0, 0])).toEqual([0, 0, 0, 1]);
  });

  it('transforms points by position and rotation', () => {
    close3(transformPoint([1, 2, 3], quatFromAxisAngle([0, 0, 1], 180), [1, 0, 0]), [0, 2, 3]);
  });
});

describe('rounding', () => {
  it('avoids negative zero', () => {
    expect(Object.is(round(-0.0000001), 0)).toBe(true);
    expect(round3([1.23456789, -0, 2])).toEqual([1.234568, 0, 2]);
  });
});

describe('schematic transforms', () => {
  it('rotates counter-clockwise on screen (y down)', () => {
    expect(transformPoint2([0, 0], 90, false, [1, 0])).toEqual([0, -1]);
    expect(transformPoint2([0, 0], 180, false, [1, 0])).toEqual([-1, 0]);
    expect(transformPoint2([0, 0], 270, false, [1, 0])).toEqual([0, 1]);
  });

  it('mirrors before rotating and translates', () => {
    expect(transformPoint2([10, 5], 0, true, [3, 1])).toEqual([7, 6]);
    expect(transformPoint2([10, 5], 90, true, [3, 0])).toEqual([10, 8]);
  });

  it('detects points on segments, including diagonals and endpoints', () => {
    expect(pointOnSegment([2, 0], [0, 0], [4, 0])).toBe(true);
    expect(pointOnSegment([4, 0], [0, 0], [4, 0])).toBe(true);
    expect(pointOnSegment([5, 0], [0, 0], [4, 0])).toBe(false);
    expect(pointOnSegment([1, 1], [0, 0], [2, 2])).toBe(true);
    expect(pointOnSegment([1, 0], [0, 0], [2, 2])).toBe(false);
  });
});
