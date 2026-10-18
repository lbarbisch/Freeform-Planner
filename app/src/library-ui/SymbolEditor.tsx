import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { copyUnit, inUnit, itemUnit, pinInnerEnd, setUnitCount, snap, symbolBounds, symbolUnit, unitCount, unitName, upsert, validateSymbol, type Graphic, type PinDirection, type SymbolDef, type SymbolPin, type Vec2 } from '../core';
import { applyLibrary, endGesture, notify } from '../app/store';
import { CheckField, Issues, NumberField, TextField } from '../app/fields';
import { isTypingTarget } from '../app/keyboard';
import { GraphicShape, SymbolGraphics } from '../schematic/SymbolGraphics';

type Tool = 'select' | 'line' | 'rect' | 'circle' | 'pin' | 'text';
type Sel = { kind: 'graphic'; index: number } | { kind: 'pin'; index: number } | { kind: 'ref' } | { kind: 'value' } | null;

interface View {
  /** grid point in the middle of the canvas */
  cx: number;
  cy: number;
  /** px per grid unit */
  scale: number;
}

const DEFAULT_SCALE = 24;
const DIRS: PinDirection[] = ['right', 'down', 'left', 'up'];

/** Graphics snap to half grid units, pins to whole units so wires can connect. */
const snapHalf = (p: Vec2): Vec2 => snap(p, 0.5);

function moveGraphic(g: Graphic, d: Vec2): Graphic {
  const m = (p: Vec2): Vec2 => [p[0] + d[0], p[1] + d[1]];
  switch (g.kind) {
    case 'line':
      return { ...g, points: g.points.map(m) };
    case 'rect':
      return { ...g, from: m(g.from), to: m(g.to) };
    case 'circle':
      return { ...g, center: m(g.center) };
    case 'text':
      return { ...g, at: m(g.at) };
  }
}

export function SymbolEditor({ symbol }: { symbol: SymbolDef }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [view, setView] = useState<View>({ cx: 0, cy: 0, scale: DEFAULT_SCALE });
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<Sel>(null);
  const [unitChoice, setUnitChoice] = useState(1);
  const [cursor, setCursor] = useState<Vec2>([0, 0]);
  const [linePoints, setLinePoints] = useState<Vec2[]>([]);
  const [shapeStart, setShapeStart] = useState<Vec2 | null>(null);
  const drag = useRef<{ last: Vec2; key: string } | null>(null);
  const pan = useRef<{ client: Vec2; center: Vec2 } | null>(null);
  const issues = useMemo(() => validateSymbol(symbol), [symbol]);
  const units = unitCount(symbol);
  const unit = Math.min(unitChoice, units);
  /** new items belong to the subpart being edited */
  const newUnit = units > 1 ? { unit } : {};

  const update = (patch: Partial<SymbolDef>, key: string | null = null) => applyLibrary((l) => upsert(l, 'symbols', { ...symbol, ...patch }), key);

  useLayoutEffect(() => {
    const svg = svgRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: svg.clientWidth || 1, h: svg.clientHeight || 1 }));
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  const viewW = size.w / view.scale;
  const viewH = size.h / view.scale;
  const viewX = view.cx - viewW / 2;
  const viewY = view.cy - viewH / 2;
  const toGrid = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    return [viewX + (e.clientX - r.left) / view.scale, viewY + (e.clientY - r.top) / view.scale];
  };

  const fit = useCallback(() => {
    const b = symbolBounds(symbolUnit(symbol, unit));
    const w = b.max[0] - b.min[0] + 8;
    const h = b.max[1] - b.min[1] + 8;
    const scale = Math.max(4, Math.min(60, Math.min(size.w / w, size.h / h)));
    setView({ cx: (b.min[0] + b.max[0]) / 2, cy: (b.min[1] + b.max[1]) / 2, scale });
  }, [symbol, unit, size]);

  const deleteSelected = () => {
    if (sel?.kind === 'graphic') update({ graphics: symbol.graphics.filter((_, i) => i !== sel.index) });
    if (sel?.kind === 'pin') update({ pins: symbol.pins.filter((_, i) => i !== sel.index) });
    setSel(null);
  };

  const finishLine = () => {
    if (linePoints.length >= 2) update({ graphics: [...symbol.graphics, { kind: 'line', points: linePoints, fill: false, ...newUnit }] });
    setLinePoints([]);
  };

  const switchUnit = (u: number) => {
    setUnitChoice(u);
    setSel(null);
    setLinePoints([]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      else if (e.key === 'Escape') {
        if (linePoints.length) finishLine();
        else setTool('select');
      } else if (e.key === 'Enter') finishLine();
      else if (e.key === 'Home') fit();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || e.button === 2) {
      pan.current = { client: [e.clientX, e.clientY], center: [view.cx, view.cy] };
      svgRef.current!.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const raw = toGrid(e);
    const p = snapHalf(raw);
    const whole = snap(raw);
    switch (tool) {
      case 'select': {
        const el = (e.target as Element).closest('[data-sel]');
        if (!el) return setSel(null);
        const [kind, idx] = el.getAttribute('data-sel')!.split(':');
        const next = (kind === 'ref' || kind === 'value' ? { kind } : { kind, index: Number(idx) }) as Sel;
        setSel(next);
        drag.current = { last: kind === 'pin' ? whole : p, key: `symdrag:${e.timeStamp}` };
        svgRef.current!.setPointerCapture(e.pointerId);
        return;
      }
      case 'line':
        setLinePoints((pts) => (pts.length && pts[pts.length - 1]![0] === p[0] && pts[pts.length - 1]![1] === p[1] ? pts : [...pts, p]));
        return;
      case 'rect':
      case 'circle':
        setShapeStart(p);
        svgRef.current!.setPointerCapture(e.pointerId);
        return;
      case 'pin': {
        const numbers = symbol.pins.map((x) => Number(x.number)).filter(Number.isFinite);
        const number = String((numbers.length ? Math.max(...numbers) : 0) + 1);
        // pins point towards the body: guess from the side of the origin they are placed on
        const dir: PinDirection = Math.abs(whole[0]) >= Math.abs(whole[1]) ? (whole[0] < 0 ? 'right' : 'left') : whole[1] < 0 ? 'down' : 'up';
        const pin: SymbolPin = { number, name: '', at: whole, dir, length: 2, ...newUnit };
        update({ pins: [...symbol.pins, pin] });
        setSel({ kind: 'pin', index: symbol.pins.length });
        setTool('select');
        return;
      }
      case 'text':
        update({ graphics: [...symbol.graphics, { kind: 'text', at: p, text: 'Text', size: 1, ...newUnit }] });
        setSel({ kind: 'graphic', index: symbol.graphics.length });
        setTool('select');
        return;
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const pn = pan.current;
    if (pn) {
      setView((v) => ({ ...v, cx: pn.center[0] - (e.clientX - pn.client[0]) / v.scale, cy: pn.center[1] - (e.clientY - pn.client[1]) / v.scale }));
      return;
    }
    const raw = toGrid(e);
    const p = snapHalf(raw);
    setCursor(p);
    const d = drag.current;
    if (!d || !sel) return;
    const target = sel.kind === 'pin' ? snap(raw) : p;
    const delta: Vec2 = [target[0] - d.last[0], target[1] - d.last[1]];
    if (!delta[0] && !delta[1]) return;
    d.last = target;
    if (sel.kind === 'graphic') {
      update({ graphics: symbol.graphics.map((g, i) => (i === sel.index ? moveGraphic(g, delta) : g)) }, d.key);
    } else if (sel.kind === 'pin') {
      update({ pins: symbol.pins.map((pin, i) => (i === sel.index ? { ...pin, at: [pin.at[0] + delta[0], pin.at[1] + delta[1]] as Vec2 } : pin)) }, d.key);
    } else if (sel.kind === 'ref') update({ refAt: [symbol.refAt[0] + delta[0], symbol.refAt[1] + delta[1]] }, d.key);
    else update({ valueAt: [symbol.valueAt[0] + delta[0], symbol.valueAt[1] + delta[1]] }, d.key);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (pan.current) {
      pan.current = null;
      return;
    }
    if (drag.current) {
      drag.current = null;
      endGesture();
    }
    if (shapeStart) {
      const p = snapHalf(toGrid(e));
      const g: Graphic | null =
        tool === 'rect' && p[0] !== shapeStart[0] && p[1] !== shapeStart[1]
          ? { kind: 'rect', from: shapeStart, to: p, fill: false, ...newUnit }
          : tool === 'circle' && Math.hypot(p[0] - shapeStart[0], p[1] - shapeStart[1]) > 0
            ? { kind: 'circle', center: shapeStart, radius: Math.round(Math.hypot(p[0] - shapeStart[0], p[1] - shapeStart[1]) * 2) / 2, fill: false, ...newUnit }
            : null;
      if (g) {
        update({ graphics: [...symbol.graphics, g] });
        setSel({ kind: 'graphic', index: symbol.graphics.length });
      }
      setShapeStart(null);
    }
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const factor = Math.pow(1.0015, -e.deltaY);
    const at = toGrid(e);
    setView((v) => {
      const scale = Math.max(4, Math.min(120, v.scale * factor));
      // keep the point under the cursor in place
      return { scale, cx: at[0] - (at[0] - v.cx) * (v.scale / scale), cy: at[1] - (at[1] - v.cy) * (v.scale / scale) };
    });
  };

  const b = symbolBounds(symbolUnit(symbol, unit));
  const preview: Graphic | null =
    tool === 'line' && linePoints.length
      ? { kind: 'line', points: [...linePoints, cursor], fill: false }
      : shapeStart && tool === 'rect'
        ? { kind: 'rect', from: shapeStart, to: cursor, fill: false }
        : shapeStart && tool === 'circle'
          ? { kind: 'circle', center: shapeStart, radius: Math.max(0.1, Math.hypot(cursor[0] - shapeStart[0], cursor[1] - shapeStart[1])), fill: false }
          : null;
  const isSel = (kind: 'graphic' | 'pin', i: number) => sel?.kind === kind && sel.index === i;

  return (
    <div className="editor-split">
      <div className="editor-canvas">
        <div className="toolbar" role="toolbar" aria-label="Symbol tools">
          {(['select', 'line', 'rect', 'circle', 'pin', 'text'] as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'active' : ''} onClick={() => setTool(t)} data-testid={`symtool-${t}`}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
          <span className="sep" />
          <button onClick={fit} title="Fit view (Home)">
            Fit
          </button>
          {units > 1 && (
            <>
              <span className="sep" />
              <span className="toolbar-label">Subpart</span>
              {Array.from({ length: units }, (_, k) => k + 1).map((u) => (
                <button key={u} className={u === unit ? 'active' : ''} onClick={() => switchUnit(u)} data-testid={`symunit-${u}`}>
                  {unitName(u)}
                </button>
              ))}
              <select
                value=""
                onChange={(e) => {
                  const from = Number(e.target.value);
                  if (from) update(copyUnit(symbol, from, unit));
                }}
                aria-label="Copy another subpart into this one"
                title="Copy the drawing and pins of another subpart into this one (pins get new numbers)"
                data-testid="symunit-copy"
              >
                <option value="">Copy from…</option>
                {Array.from({ length: units }, (_, k) => k + 1)
                  .filter((u) => u !== unit)
                  .map((u) => (
                    <option key={u} value={u}>
                      Subpart {unitName(u)}
                    </option>
                  ))}
              </select>
            </>
          )}
          <span className="toolbar-hint">
            {tool === 'line'
              ? 'Click points, Enter or Esc to finish'
              : tool === 'pin'
                ? 'Click where the wire should connect'
                : tool === 'select'
                  ? 'Drag to move, Del to delete · Right/middle-drag to pan · Wheel to zoom'
                  : 'Drag to draw'}
          </span>
        </div>
        <svg
          ref={svgRef}
          className="sheet symbol-sheet"
          data-testid="symbol-canvas"
          viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
          onDoubleClick={() => tool === 'line' && finishLine()}
        >
          <defs>
            <pattern id="symgrid" width={1} height={1} patternUnits="userSpaceOnUse">
              <circle cx={0} cy={0} r={Math.max(0.06, 1.2 / view.scale)} className="grid-dot" />
            </pattern>
          </defs>
          <rect x={viewX} y={viewY} width={viewW} height={viewH} fill="url(#symgrid)" />
          <path d="M-1 0H1M0 -1V1" className="origin-cross" />
          <rect className="bounds" x={b.min[0]} y={b.min[1]} width={b.max[0] - b.min[0]} height={b.max[1] - b.min[1]} />
          <SymbolGraphics symbol={{ ...symbol, graphics: [], pins: [] }} at={[0, 0]} rotation={0} mirror={false} />
          <g className="sym-body">
            {symbol.graphics.map((g, i) =>
              inUnit(g, unit) ? (
                <g key={i} data-sel={`graphic:${i}`} className={isSel('graphic', i) ? 'selected' : ''}>
                  {isSel('graphic', i) && <GraphicShape g={g} className="sel-halo" />}
                  <GraphicShape g={g} className="hit-stroke" />
                  <GraphicShape g={g} />
                </g>
              ) : null,
            )}
          </g>
          {symbol.pins.map((pin, i) => {
            if (!inUnit(pin, unit)) return null;
            const inner = pinInnerEnd(pin);
            return (
              <g key={i} data-sel={`pin:${i}`} className={isSel('pin', i) ? 'selected' : ''}>
                {isSel('pin', i) && (
                  <g className="sel-halo">
                    <line x1={pin.at[0]} y1={pin.at[1]} x2={inner[0]} y2={inner[1]} />
                    <circle cx={pin.at[0]} cy={pin.at[1]} r={0.45} />
                  </g>
                )}
                <SymbolGraphics symbol={{ ...symbol, graphics: [], pins: [pin], showPinNames: true }} at={[0, 0]} rotation={0} mirror={false} />
                <circle className="pin-anchor" cx={pin.at[0]} cy={pin.at[1]} r={0.3} />
              </g>
            );
          })}
          <text data-sel="ref" className={`ref-text draggable ${sel?.kind === 'ref' ? 'selected' : ''}`} x={symbol.refAt[0]} y={symbol.refAt[1]} textAnchor="middle" dominantBaseline="central">
            {symbol.refPrefix}?{units > 1 ? unitName(unit) : ''}
          </text>
          <text data-sel="value" className={`value-text draggable ${sel?.kind === 'value' ? 'selected' : ''}`} x={symbol.valueAt[0]} y={symbol.valueAt[1]} textAnchor="middle" dominantBaseline="central">
            {symbol.power ? symbol.name : 'Value'}
          </text>
          {preview && (
            <g className="sym-body draft">
              <GraphicShape g={preview} />
            </g>
          )}
        </svg>
      </div>
      <aside className="side-panel">
        <h3>Symbol</h3>
        <TextField label="Name" value={symbol.name} onCommit={(name) => update({ name })} testId="symbol-name" />
        <TextField label="Reference prefix" value={symbol.refPrefix} onCommit={(refPrefix) => update({ refPrefix })} />
        <NumberField
          label="Subparts"
          value={units}
          step={1}
          testId="symbol-units"
          onCommit={(n) => update(setUnitCount(symbol, n))}
        />
        {units > 1 && (
          <p className="muted">
            Each subpart (A, B, …) is drawn and placed on its own, e.g. the two amplifiers and the supply of a dual op-amp. Every graphic and pin belongs to exactly one subpart, and pin numbers are unique across all subparts. New items go
            into the subpart you are editing.
          </p>
        )}
        <CheckField label="Show pin numbers" value={symbol.showPinNumbers} onChange={(showPinNumbers) => update({ showPinNumbers })} />
        <CheckField label="Show pin names" value={symbol.showPinNames} onChange={(showPinNames) => update({ showPinNames })} />
        <CheckField label="Power symbol (names its net)" value={symbol.power} onChange={(power) => update({ power })} />
        <SelectionProps symbol={symbol} sel={sel} update={update} onDelete={deleteSelected} />
        <h4>Check</h4>
        <Issues issues={issues} />
      </aside>
    </div>
  );
}

/** Moves a pin or graphic to another subpart. */
function UnitField({ units, value, onChange }: { units: number; value: number; onChange: (unit: number) => void }) {
  if (units <= 1) return null;
  return (
    <label className="field">
      <span>Subpart</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid="item-unit">
        {Array.from({ length: units }, (_, k) => k + 1).map((u) => (
          <option key={u} value={u}>
            {unitName(u)}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectionProps({ symbol, sel, update, onDelete }: { symbol: SymbolDef; sel: Sel; update: (p: Partial<SymbolDef>) => void; onDelete: () => void }) {
  const units = unitCount(symbol);
  if (!sel || sel.kind === 'ref' || sel.kind === 'value') return null;
  if (sel.kind === 'pin') {
    const pin = symbol.pins[sel.index];
    if (!pin) return null;
    const set = (patch: Partial<SymbolPin>) => update({ pins: symbol.pins.map((p, i) => (i === sel.index ? { ...p, ...patch } : p)) });
    return (
      <div className="props" data-testid="pin-props">
        <h4>Pin</h4>
        <TextField
          label="Number"
          value={pin.number}
          onCommit={(text) => {
            const number = text.trim();
            if (!number) return false;
            // pin numbers are physical pins, unique across all subparts
            const other = symbol.pins.find((p, i) => i !== sel.index && p.number === number);
            if (other) {
              notify('error', `Pin number ${number} is already used${units > 1 ? ` in subpart ${unitName(itemUnit(other))}` : ''}.`);
              return false;
            }
            set({ number });
          }}
          testId="pin-number"
        />
        <TextField label="Name" value={pin.name} onCommit={(name) => set({ name })} testId="pin-name" />
        <label className="field">
          <span>Points</span>
          <select value={pin.dir} onChange={(e) => set({ dir: e.target.value as PinDirection })}>
            {DIRS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <UnitField units={units} value={itemUnit(pin)} onChange={(unit) => set({ unit })} />
        <div className="row">
          <NumberField compact label="X" value={pin.at[0]} step={1} onCommit={(x) => set({ at: [Math.round(x), pin.at[1]] })} />
          <NumberField compact label="Y" value={pin.at[1]} step={1} onCommit={(y) => set({ at: [pin.at[0], Math.round(y)] })} />
          <NumberField compact label="Length" value={pin.length} step={1} onCommit={(length) => set({ length: Math.max(0, length) })} />
        </div>
        <button onClick={onDelete}>Delete pin</button>
      </div>
    );
  }
  const g = symbol.graphics[sel.index];
  if (!g) return null;
  const set = (next: Graphic) => update({ graphics: symbol.graphics.map((x, i) => (i === sel.index ? next : x)) });
  return (
    <div className="props">
      <h4>{g.kind[0]!.toUpperCase() + g.kind.slice(1)}</h4>
      {g.kind === 'text' && (
        <>
          <TextField label="Text" value={g.text} onCommit={(text) => set({ ...g, text })} />
          <NumberField label="Size" value={g.size} onCommit={(size) => set({ ...g, size: Math.max(0.2, size) })} />
        </>
      )}
      {g.kind === 'circle' && <NumberField label="Radius" value={g.radius} onCommit={(radius) => set({ ...g, radius: Math.max(0.1, radius) })} />}
      {g.kind !== 'text' && <CheckField label="Filled" value={g.fill} onChange={(fill) => set({ ...g, fill })} />}
      <UnitField units={units} value={itemUnit(g)} onChange={(unit) => set({ ...g, unit })} />
      <button onClick={onDelete}>Delete</button>
    </div>
  );
}
