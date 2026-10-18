import { memo } from 'react';
import { PIN_DIRECTION, pinInnerEnd, symbolBounds, symbolUnit, transformPoint2, type Graphic, type Rotation, type SymbolDef, type Vec2 } from '../core';

/** SVG transform matching core transformPoint2: mirror x, then rotate counter-clockwise. */
export function symbolTransform(at: Vec2, rotation: Rotation, mirror: boolean): string {
  return `translate(${at[0]} ${at[1]}) rotate(${-rotation}) scale(${mirror ? -1 : 1} 1)`;
}

export function GraphicShape({ g, className }: { g: Graphic; className?: string }) {
  const fill = 'fill' in g && g.fill ? 'var(--sym-fill)' : 'none';
  switch (g.kind) {
    case 'line':
      return <polyline className={className} points={g.points.map((p) => p.join(',')).join(' ')} fill={fill} />;
    case 'rect': {
      const x = Math.min(g.from[0], g.to[0]);
      const y = Math.min(g.from[1], g.to[1]);
      return <rect className={className} x={x} y={y} width={Math.abs(g.to[0] - g.from[0])} height={Math.abs(g.to[1] - g.from[1])} fill={fill} />;
    }
    case 'circle':
      return <circle className={className} cx={g.center[0]} cy={g.center[1]} r={g.radius} fill={fill} />;
    case 'text':
      return (
        <text className={`sym-text ${className ?? ''}`} x={g.at[0]} y={g.at[1]} fontSize={g.size} textAnchor="middle" dominantBaseline="central">
          {g.text}
        </text>
      );
  }
}

interface Props {
  symbol: SymbolDef;
  at: Vec2;
  rotation: Rotation;
  mirror: boolean;
  refText?: string;
  valueText?: string;
  className?: string;
}

/** Draws a symbol at a sheet position. Texts stay upright regardless of rotation. */
export const SymbolGraphics = memo(function SymbolGraphics({ symbol, at, rotation, mirror, refText, valueText, className }: Props) {
  const tp = (p: Vec2) => transformPoint2(at, rotation, mirror, p);
  return (
    <g className={className}>
      <g transform={symbolTransform(at, rotation, mirror)} className="sym-body">
        {symbol.graphics.map((g, i) => (
          <GraphicShape key={i} g={g} />
        ))}
        {symbol.pins.map((pin) => {
          const inner = pinInnerEnd(pin);
          return <line key={pin.number} className="sym-pin" x1={pin.at[0]} y1={pin.at[1]} x2={inner[0]} y2={inner[1]} />;
        })}
      </g>
      {symbol.pins.map((pin) => {
        const inner = pinInnerEnd(pin);
        const d = PIN_DIRECTION[pin.dir];
        // pin number next to the middle of the pin line, offset perpendicular to it
        const mid: Vec2 = [(pin.at[0] + inner[0]) / 2 - d[1] * 0.45, (pin.at[1] + inner[1]) / 2 - Math.abs(d[0]) * 0.45];
        const nameAt: Vec2 = [inner[0] + d[0] * 0.5, inner[1] + d[1] * 0.5];
        const m = tp(mid);
        const n = tp(nameAt);
        const nd = tp([nameAt[0] + d[0], nameAt[1] + d[1]]);
        const anchor = nd[0] > n[0] + 0.1 ? 'start' : nd[0] < n[0] - 0.1 ? 'end' : 'middle';
        return (
          <g key={pin.number}>
            {symbol.showPinNumbers && pin.length > 0 && (
              <text className="pin-number" x={m[0]} y={m[1]} textAnchor="middle" dominantBaseline="central">
                {pin.number}
              </text>
            )}
            {symbol.showPinNames && pin.name && (
              <text className="pin-name" x={n[0]} y={n[1]} textAnchor={anchor} dominantBaseline="central">
                {pin.name}
              </text>
            )}
          </g>
        );
      })}
      {refText !== undefined && !symbol.power && <SymbolText at={tp(symbol.refAt)} text={refText} className="ref-text" />}
      {valueText !== undefined && <SymbolText at={tp(symbol.valueAt)} text={valueText} className="value-text" />}
    </g>
  );
});

function SymbolText({ at, text, className }: { at: Vec2; text: string; className: string }) {
  return (
    <text className={className} x={at[0]} y={at[1]} textAnchor="middle" dominantBaseline="central">
      {text}
    </text>
  );
}

/** Small standalone preview (part picker, library editor lists). Shows subpart A. */
export function SymbolPreview({ symbol: full, size = 48 }: { symbol: SymbolDef; size?: number }) {
  const symbol = symbolUnit(full, 1);
  const b = symbolBounds(symbol);
  const pad = 1;
  const w = b.max[0] - b.min[0] + pad * 2;
  const h = b.max[1] - b.min[1] + pad * 2;
  return (
    <svg className="symbol-preview" width={size} height={size} viewBox={`${b.min[0] - pad} ${b.min[1] - pad} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <SymbolGraphics symbol={{ ...symbol, showPinNumbers: false, showPinNames: false }} at={[0, 0]} rotation={0} mirror={false} />
    </svg>
  );
}
