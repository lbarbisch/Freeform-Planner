/** Pure SpaceMouse math (port of spaceMouse.py), kept separate from WebHID so it can be tested. */

export const AXIS_RANGE = 350;

export interface SpaceMouseAxes {
  /** cap slid right */
  x: number;
  /** cap lifted up */
  y: number;
  /** cap pushed forward (away from the user) */
  z: number;
  /** tilted forward */
  pitch: number;
  /** twisted clockwise seen from above */
  yaw: number;
}

export const zeroAxes = (): SpaceMouseAxes => ({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0 });

export function applyDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) <= deadzone) return 0;
  return (Math.sign(value) * (Math.abs(value) - deadzone)) / (1 - deadzone);
}

// "+ 0" turns -0 into 0
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v / AXIS_RANGE)) + 0;

/** Decodes a 3Dconnexion HID input report into normalized axes (-1..1). HID axes: x right,
 * y towards the user, z down; rotations about those axes. Older devices send translation
 * (report 1) and rotation (report 2) separately, newer ones send all six values in report 1. */
export function decodeReport(reportId: number, data: DataView, previous: SpaceMouseAxes): SpaceMouseAxes | null {
  const i16 = (offset: number) => data.getInt16(offset, true);
  if (reportId === 1 && data.byteLength >= 6) {
    const next = { ...previous, x: clamp1(i16(0)), z: clamp1(-i16(2)), y: clamp1(-i16(4)) };
    if (data.byteLength >= 12) {
      next.pitch = clamp1(i16(6));
      next.yaw = clamp1(i16(10));
    }
    return next;
  }
  if (reportId === 2 && data.byteLength >= 6) {
    return { ...previous, pitch: clamp1(i16(0)), yaw: clamp1(i16(4)) };
  }
  return null;
}

export function decodeButtons(reportId: number, data: DataView): number | null {
  return reportId === 3 && data.byteLength >= 1 ? data.getUint8(0) : null;
}

export interface CameraDeltas {
  /** fractions of the camera distance */
  panRight: number;
  panUp: number;
  zoom: number;
  /** degrees */
  orbitUp: number;
  orbitRight: number;
}

/** Object mode: the scene follows the cap. */
export function cameraDeltas(a: SpaceMouseAxes, dt: number, s: { deadzone: number; panSpeed: number; zoomSpeed: number; rotationSpeed: number }): CameraDeltas {
  const d = (v: number) => applyDeadzone(v, s.deadzone);
  return {
    panRight: -d(a.x) * s.panSpeed * dt,
    panUp: -d(a.y) * s.panSpeed * dt,
    zoom: d(a.z) * s.zoomSpeed * dt,
    orbitUp: -d(a.pitch) * s.rotationSpeed * dt,
    orbitRight: -d(a.yaw) * s.rotationSpeed * dt,
  };
}
