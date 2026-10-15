import { describe, expect, it } from 'vitest';
import { boxContains, boxFromPoints, emptyBox, growBox, isEmptyBox, pinInnerEnd, placedBounds, pointInBox, routeCorner, snap, symbolBounds } from './symbols';
import { testLibrary } from './testing';
import type { SymbolDef } from './model';

const R = testLibrary().symbols.R!;

describe('symbol geometry', () => {
  it('computes inner pin ends', () => {
    expect(pinInnerEnd(R.pins[0]!)).toEqual([-2, 0]);
    expect(pinInnerEnd({ number: '1', name: '', at: [0, 4], dir: 'up', length: 2 })).toEqual([0, 2]);
  });

  it('bounds graphics and pins', () => {
    expect(symbolBounds(R)).toEqual({ min: [-3, -1], max: [3, 1] });
    const all: SymbolDef = {
      ...R,
      graphics: [
        { kind: 'circle', center: [0, 0], radius: 5, fill: false },
        { kind: 'line', points: [[0, 0], [7, 0]], fill: false },
        { kind: 'text', at: [0, -8], text: 'x', size: 2 },
      ],
      pins: [],
    };
    expect(symbolBounds(all)).toEqual({ min: [-5, -9], max: [7, 5] });
    expect(symbolBounds({ ...R, graphics: [], pins: [] })).toEqual({ min: [-1, -1], max: [1, 1] });
  });

  it('bounds placed and rotated symbols', () => {
    expect(placedBounds(R, [10, 10], 90, false)).toEqual({ min: [9, 7], max: [11, 13] });
  });

  it('box helpers', () => {
    const b = boxFromPoints([5, 5], [0, 0]);
    expect(b).toEqual({ min: [0, 0], max: [5, 5] });
    expect(boxContains(b, boxFromPoints([1, 1], [2, 2]))).toBe(true);
    expect(boxContains(b, boxFromPoints([1, 1], [6, 2]))).toBe(false);
    expect(pointInBox([5, 5], b)).toBe(true);
    expect(pointInBox([6, 5], b)).toBe(false);
    expect(isEmptyBox(emptyBox())).toBe(true);
    expect(growBox(emptyBox(), [1, 1], 1)).toEqual({ min: [0, 0], max: [2, 2] });
  });

  it('routes orthogonally and snaps to the grid', () => {
    expect(routeCorner([0, 0], [5, 3], true)).toEqual([5, 0]);
    expect(routeCorner([0, 0], [5, 3], false)).toEqual([0, 3]);
    expect(snap([1.4, -0.4])).toEqual([1, 0]);
    expect(snap([3, 7], 5)).toEqual([5, 5]);
  });
});
