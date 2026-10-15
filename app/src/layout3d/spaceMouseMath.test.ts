import { describe, expect, it } from 'vitest';
import { applyDeadzone, cameraDeltas, decodeButtons, decodeReport, zeroAxes } from './spaceMouseMath';

const view = (...values: number[]) => {
  const dv = new DataView(new ArrayBuffer(values.length * 2));
  values.forEach((v, i) => dv.setInt16(i * 2, v, true));
  return dv;
};

describe('spaceMouse math (port of spaceMouse.py)', () => {
  it('applies the deadzone and rescales smoothly', () => {
    expect(applyDeadzone(0.04, 0.05)).toBe(0);
    expect(applyDeadzone(1, 0.05)).toBe(1);
    expect(applyDeadzone(-0.525, 0.05)).toBeCloseTo(-0.5);
  });

  it('decodes split translation/rotation reports', () => {
    let a = decodeReport(1, view(350, -175, 0), zeroAxes())!;
    expect(a).toMatchObject({ x: 1, y: 0, z: 0.5 });
    a = decodeReport(2, view(-350, 0, 700), a)!;
    expect(a).toMatchObject({ x: 1, pitch: -1, yaw: 1 });
    expect(decodeReport(7, view(1, 2, 3), a)).toBeNull();
  });

  it('decodes combined six-axis reports', () => {
    expect(decodeReport(1, view(0, 0, -350, 175, 0, 0), zeroAxes())).toMatchObject({ y: 1, pitch: 0.5 });
  });

  it('decodes buttons', () => {
    const dv = new DataView(new Uint8Array([2]).buffer);
    expect(decodeButtons(3, dv)).toBe(2);
    expect(decodeButtons(1, dv)).toBeNull();
  });

  it('moves the scene with the cap (object mode)', () => {
    const s = { deadzone: 0, panSpeed: 1, zoomSpeed: 2, rotationSpeed: 100 };
    const d = cameraDeltas({ x: 1, y: 0, z: 0.5, pitch: 0, yaw: -1 }, 0.5, s);
    expect(d).toEqual({ panRight: -0.5, panUp: -0, zoom: 0.5, orbitUp: -0, orbitRight: 50 });
  });
});
