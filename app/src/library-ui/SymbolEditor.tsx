import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { snap, symbolBounds, upsert, validateSymbol, type Graphic, type PinDirection, type SymbolDef, type SymbolPin, type Vec2 } from '../core';
import { applyLibrary, endGesture } from '../app/store';
import { CheckField, Issues, NumberField, TextField } from '../app/fields';
import { isTypingTarget } from '../app/keyboard';
import { GraphicShape, SymbolGraphics } from '../schematic/SymbolGraphics';

type Tool = 'select' | 'line' | 'rect' | 'circle' | 'pin' | 'text';
type Sel = { kind: 'graphic'; index: number } | { kind: 'pin'; index: number } | { kind: 'ref' } | { kind: 'value' } | null;

const SCALE = 24; // px per grid unit
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
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<Sel>(null);
  const [cursor, setCursor] = useState<Vec2>([0, 0]);
  const [linePoints, setLinePoints] = useState<Vec2[]>([]);
  const [shapeStart, setShapeStart] = useState<Vec2 | null>(null);
  const drag = useRef<{ last: Vec2; key: string } | null>(null);
  const issues = useMemo(() => validateSymbol(symbol), [symbol]);

  const update = (patch: Partial<SymbolDef>, key: string | null = null) => applyLibrary((l) => upsert(l, 'symbols', { ...symbol, ...patch }), key);

  useLayoutEffect(() => {
    const svg = svgRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: svg.clientWidth || 1, h: svg.clientHeight || 1 }));
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  const viewX = -size.w / SCALE / 2;
  const viewY = -size.h / SCALE / 2;
  const toGrid = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    return [viewX + (e.clientX - r.left) / SCALE, viewY + (e.clientY - r.top) / SCALE];
  };

  const deleteSelected = () => {
    if (sel?.kind === 'graphic') update({ graphics: symbol.graphics.filter((_, i) => i !== sel.index) });
    if (sel?.kind === 'pin') update({ pins: symbol.pins.filter((_, i) => i !== sel.index) });
    setSel(null);
  };

  const finishLine = () => {
    if (linePoints.length >= 2) update({ graphics: [...symbol.graphics, { kind: 'line', points: linePoints, fill: false }] });
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
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
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
        const pin: SymbolPin = { number, name: '', at: whole, dir, length: 2 };
        update({ pins: [...symbol.pins, pin] });
        setSel({ kind: 'pin', index: symbol.pins.length });
        setTool('select');
        return;
      }
      case 'text':
        update({ graphics: [...symbol.graphics, { kind: 'text', at: p, text: 'Text', size: 1 }] });
        setSel({ kind: 'graphic', index: symbol.graphics.length });
        setTool('select');
        return;
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
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
    if (drag.current) {
      drag.current = null;
      endGesture();
    }
    if (shapeStart) {
      const p = snapHalf(toGrid(e));
      const g: Graphic | null =
        tool === 'rect' && p[0] !== shapeStart[0] && p[1] !== shapeStart[1]
          ? { kind: 'rect', from: shapeStart, to: p, fill: false }
          : tool === 'circle' && Math.hypot(p[0] - shapeStart[0], p[1] - shapeStart[1]) > 0
            ? { kind: 'circle', center: shapeStart, radius: Math.round(Math.hypot(p[0] - shapeStart[0], p[1] - shapeStart[1]) * 2) / 2, fill: false }
            : null;
      if (g) {
        update({ graphics: [...symbol.graphics, g] });
        setSel({ kind: 'graphic', index: symbol.graphics.length });
      }
      setShapeStart(null);
    }
  };

  const b = symbolBounds(symbol);
  const preview: Graphic | null =
    tool === 'line' && linePoints.length
      ? { kind: 'line', points: [...linePoints, cursor], fill: false }
      : shapeStart && tool === 'rect'
        ? { kind: 'rect', from: shapeStart, to: cursor, fill: false }
        : shapeStart && tool === 'circle'
          ? { kind: 'circle', center: shapeStart, radius: Math.max(0.1, Math.hypot(cursor[0] - shapeStart[0], cursor[1] - shapeStart[1])), fill: false }
          : null;

  return (
    <div className="editor-split">
      <div className="editor-canvas">
        <div className="toolbar" role="toolbar" aria-label="Symbol tools">
          {(['select', 'line', 'rect', 'circle', 'pin', 'text'] as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'active' : ''} onClick={() => setTool(t)} data-testid={`symtool-${t}`}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
          <span className="toolbar-hint">
            {tool === 'line' ? 'Click points, Enter or Esc to finish' : tool === 'pin' ? 'Click where the wire should connect' : tool === 'select' ? 'Drag to move, Del to delete' : 'Drag to draw'}
          </span>
        </div>
        <svg
          ref={svgRef}
          className="sheet symbol-sheet"
          data-testid="symbol-canvas"
          viewBox={`${viewX} ${viewY} ${size.w / SCALE} ${size.h / SCALE}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={() => tool === 'line' && finishLine()}
        >
          <defs>
            <pattern id="symgrid" width={1} height={1} patternUnits="userSpaceOnUse">
              <circle cx={0} cy={0} r={0.06} className="grid-dot" />
            </pattern>
          </defs>
          <rect x={viewX} y={viewY} width={size.w / SCALE} height={size.h / SCALE} fill="url(#symgrid)" />
          <path d="M-1 0H1M0 -1V1" className="origin-cross" />
          <rect className="bounds" x={b.min[0]} y={b.min[1]} width={b.max[0] - b.min[0]} height={b.max[1] - b.min[1]} />
          <SymbolGraphics symbol={{ ...symbol, graphics: [], pins: [] }} at={[0, 0]} rotation={0} mirror={false} />
          <g className="sym-body">
            {symbol.graphics.map((g, i) => (
              <g key={i} data-sel={`graphic:${i}`} className={sel?.kind === 'graphic' && sel.index === i ? 'selected' : ''}>
                <GraphicShape g={g} className="hit-stroke" />
                <GraphicShape g={g} />
              </g>
            ))}
          </g>
          {symbol.pins.map((pin, i) => (
            <g key={i} data-sel={`pin:${i}`} className={sel?.kind === 'pin' && sel.index === i ? 'selected' : ''}>
              <SymbolGraphics symbol={{ ...symbol, graphics: [], pins: [pin], showPinNames: true }} at={[0, 0]} rotation={0} mirror={false} />
              <circle className="pin-anchor" cx={pin.at[0]} cy={pin.at[1]} r={0.3} />
            </g>
          ))}
          <text data-sel="ref" className={`ref-text draggable ${sel?.kind === 'ref' ? 'selected' : ''}`} x={symbol.refAt[0]} y={symbol.refAt[1]} textAnchor="middle" dominantBaseline="central">
            {symbol.refPrefix}?
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

function SelectionProps({ symbol, sel, update, onDelete }: { symbol: SymbolDef; sel: Sel; update: (p: Partial<SymbolDef>) => void; onDelete: () => void }) {
  if (!sel || sel.kind === 'ref' || sel.kind === 'value') return null;
  if (sel.kind === 'pin') {
    const pin = symbol.pins[sel.index];
    if (!pin) return null;
    const set = (patch: Partial<SymbolPin>) => update({ pins: symbol.pins.map((p, i) => (i === sel.index ? { ...p, ...patch } : p)) });
    return (
      <div className="props" data-testid="pin-props">
        <h4>Pin</h4>
        <TextField label="Number" value={pin.number} onCommit={(number) => number.trim() && set({ number: number.trim() })} testId="pin-number" />
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
      <button onClick={onDelete}>Delete</button>
    </div>
  );
}
