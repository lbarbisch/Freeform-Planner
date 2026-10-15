/** Geometry helpers for symbols, shared by the schematic and the symbol editor. */
import { transformPoint2, type Rotation, type Vec2 } from './geometry';
import type { PinDirection, SymbolDef, SymbolPin } from './model';

export const PIN_DIRECTION: Record<PinDirection, Vec2> = {
  right: [1, 0],
  left: [-1, 0],
  up: [0, -1],
  down: [0, 1],
};

/** Inner end of a pin (where it meets the body). */
export function pinInnerEnd(pin: SymbolPin): Vec2 {
  const d = PIN_DIRECTION[pin.dir];
  return [pin.at[0] + d[0] * pin.length, pin.at[1] + d[1] * pin.length];
}

export interface Box {
  min: Vec2;
  max: Vec2;
}

export function emptyBox(): Box {
  return { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
}

export function growBox(b: Box, p: Vec2, margin = 0): Box {
  return {
    min: [Math.min(b.min[0], p[0] - margin), Math.min(b.min[1], p[1] - margin)],
    max: [Math.max(b.max[0], p[0] + margin), Math.max(b.max[1], p[1] + margin)],
  };
}

export function isEmptyBox(b: Box): boolean {
  return b.min[0] > b.max[0];
}

/** Local bounding box of a symbol's graphics and pins (text excluded). */
export function symbolBounds(symbol: SymbolDef): Box {
  let b = emptyBox();
  for (const g of symbol.graphics) {
    switch (g.kind) {
      case 'line':
        for (const p of g.points) b = growBox(b, p);
        break;
      case 'rect':
        b = growBox(growBox(b, g.from), g.to);
        break;
      case 'circle':
        b = growBox(b, g.center, g.radius);
        break;
      case 'text':
        b = growBox(b, g.at, g.size / 2);
        break;
    }
  }
  for (const pin of symbol.pins) b = growBox(growBox(b, pin.at), pinInnerEnd(pin));
  if (isEmptyBox(b)) b = { min: [-1, -1], max: [1, 1] };
  return b;
}

/** Bounding box of a placed symbol in sheet coordinates. */
export function placedBounds(symbol: SymbolDef, at: Vec2, rotation: Rotation, mirror: boolean): Box {
  const local = symbolBounds(symbol);
  let b = emptyBox();
  for (const corner of [local.min, local.max, [local.min[0], local.max[1]] as Vec2, [local.max[0], local.min[1]] as Vec2]) {
    b = growBox(b, transformPoint2(at, rotation, mirror, corner));
  }
  return b;
}

export function boxContains(outer: Box, inner: Box): boolean {
  return inner.min[0] >= outer.min[0] && inner.min[1] >= outer.min[1] && inner.max[0] <= outer.max[0] && inner.max[1] <= outer.max[1];
}

export function boxFromPoints(a: Vec2, b: Vec2): Box {
  return { min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])] };
}

export function pointInBox(p: Vec2, b: Box): boolean {
  return p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1];
}

/** Corner of an orthogonal two-segment route from a to b. */
export function routeCorner(a: Vec2, b: Vec2, horizontalFirst: boolean): Vec2 {
  return horizontalFirst ? [b[0], a[1]] : [a[0], b[1]];
}

export function snap(p: Vec2, grid = 1): Vec2 {
  return [Math.round(p[0] / grid) * grid + 0, Math.round(p[1] / grid) * grid + 0];
}
