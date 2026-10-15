/** Small, dependency-free vector and quaternion helpers.
 *
 * 3D convention (same as Three.js): right-handed, Y up, units in millimetres.
 * Quaternions are stored as [x, y, z, w].
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length3(a: Vec3): number {
  return Math.sqrt(dot3(a, a));
}

export function distance3(a: Vec3, b: Vec3): number {
  return length3(sub3(a, b));
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  if (l === 0) return [...IDENTITY_QUAT];
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function quatFromAxisAngle(axis: Vec3, degrees: number): Quat {
  const l = length3(axis);
  const half = (degrees * Math.PI) / 360;
  const s = Math.sin(half) / l;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

export function rotateVec3(q: Quat, v: Vec3): Vec3 {
  // v' = q * v * q^-1, expanded
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Rotate around a world axis: the new rotation is applied after the existing one. */
export function rotateWorld(q: Quat, axis: Vec3, degrees: number): Quat {
  return quatNormalize(quatMultiply(quatFromAxisAngle(axis, degrees), q));
}

/** Transform a local point by position + rotation. */
export function transformPoint(position: Vec3, rotation: Quat, local: Vec3): Vec3 {
  return add3(position, rotateVec3(rotation, local));
}

/** Round a number to a fixed amount of decimals to keep saved files and tests stable. */
export function round(n: number, decimals = 6): number {
  const f = 10 ** decimals;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

export function round3(v: Vec3, decimals = 6): Vec3 {
  return [round(v[0], decimals), round(v[1], decimals), round(v[2], decimals)];
}

// ---------------------------------------------------------------- 2D (schematic)

/** Schematic rotation in degrees, counter-clockwise on screen. */
export type Rotation = 0 | 90 | 180 | 270;

/** Transform a symbol-local point into sheet coordinates.
 * Sheet coordinates use screen orientation (y grows downwards). Mirroring flips the x axis
 * before rotating. Rotation is counter-clockwise as seen on screen.
 */
export function transformPoint2(at: Vec2, rotation: Rotation, mirror: boolean, local: Vec2): Vec2 {
  let x = mirror ? -local[0] : local[0];
  let y = local[1];
  switch (rotation) {
    case 0:
      break;
    case 90:
      [x, y] = [y, -x];
      break;
    case 180:
      [x, y] = [-x, -y];
      break;
    case 270:
      [x, y] = [-y, x];
      break;
  }
  return [at[0] + x + 0, at[1] + y + 0];
}

export function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

/** True when p lies on the axis-aligned or diagonal segment a-b (endpoints included). */
export function pointOnSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (Math.abs(cross) > 1e-9) return false;
  return (
    p[0] >= Math.min(a[0], b[0]) - 1e-9 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-9 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-9
  );
}

export function pointKey(p: Vec2): string {
  return `${round(p[0], 4)},${round(p[1], 4)}`;
}
