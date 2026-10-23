import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  addLabel,
  addWire,
  annotate,
  boxContains,
  boxFromPoints,
  deleteSelection,
  deriveNetlist,
  displayRef,
  emptyBox,
  growBox,
  instancePinPoints,
  instanceSymbol,
  isEmptyBox,
  junctionPoints,
  mirrorInstance,
  moveSelection,
  placedBounds,
  placePart,
  pointInBox,
  pointOnSegment,
  renameLabel,
  rotateInstance,
  routeCorner,
  samePoint,
  snap,
  symbolOf,
  symbolUnit,
  transformPoint2,
  unitOffsets,
  type Box,
  type Project,
  type Rotation,
  type Vec2,
} from '../core';
import { apply, clearSelection, endGesture, getState, notify, project as currentProject, select, setState, useApp, type AppSelection } from '../app/store';
import { PromptDialog } from '../app/Dialog';
import { isTypingTarget } from '../app/keyboard';
import { PartPicker } from './PartPicker';
import { SchematicProperties } from './SchematicProperties';
import { SymbolGraphics } from './SymbolGraphics';

type Tool = { kind: 'select' } | { kind: 'wire' } | { kind: 'label' } | { kind: 'place'; partId: string; rotation: Rotation; mirror: boolean };

type Drag =
  | { kind: 'move'; last: Vec2; key: string }
  | { kind: 'box'; start: Vec2; additive: boolean }
  | { kind: 'pan'; client: Vec2; origin: Vec2 };

interface ViewBox {
  x: number;
  y: number;
  /** pixels per grid unit */
  scale: number;
}

declare global {
  interface Window {
    __ffpSchematic?: { toClient: (p: Vec2) => { x: number; y: number } };
  }
}

const HIT_MARGIN = 0.4;

export function SchematicView() {
  const project = useApp((s) => s.history.present);
  const selection = useApp((s) => s.selection);
  const svgRef = useRef<SVGSVGElement>(null);
  // null until the sheet has been measured
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<ViewBox>({ x: -40, y: -25, scale: 14 });
  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [cursor, setCursor] = useState<Vec2>([0, 0]);
  const [draft, setDraft] = useState<Vec2 | null>(null);
  const [horizontalFirst, setHorizontalFirst] = useState(true);
  const [box, setBox] = useState<Box | null>(null);
  const [prompt, setPrompt] = useState<{ kind: 'new'; at: Vec2 } | { kind: 'rename'; id: string } | null>(null);
  const [focusRef, setFocusRef] = useState(0);
  const dragRef = useRef<Drag | null>(null);
  const [lastLabel, setLastLabel] = useState('NET1');

  const netlist = useMemo(() => deriveNetlist(project), [project]);
  // shown in the app's status bar
  useEffect(() => setState({ schematicCursor: cursor }), [cursor]);
  useEffect(() => () => setState({ schematicCursor: null }), []);
  const junctions = useMemo(() => junctionPoints(project), [project]);
  const selected = useMemo(() => new Set([...selection.instances, ...selection.wires, ...selection.labels]), [selection]);

  // ---------------------------------------------------------------- view mapping

  useLayoutEffect(() => {
    const svg = svgRef.current!;
    const measure = () => setSize({ w: svg.clientWidth || 1, h: svg.clientHeight || 1 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  const toGrid = useCallback(
    (clientX: number, clientY: number): Vec2 => {
      const r = svgRef.current!.getBoundingClientRect();
      return [view.x + (clientX - r.left) / view.scale, view.y + (clientY - r.top) / view.scale];
    },
    [view],
  );

  useEffect(() => {
    window.__ffpSchematic = {
      toClient: (p: Vec2) => {
        const r = svgRef.current!.getBoundingClientRect();
        return { x: r.left + (p[0] - view.x) * view.scale, y: r.top + (p[1] - view.y) * view.scale };
      },
    };
  }, [view]);

  const fit = useCallback(() => {
    if (!size) return;
    const b = sheetBounds(currentProject());
    if (isEmptyBox(b)) {
      setView((v) => ({ ...v, x: -size.w / v.scale / 2, y: -size.h / v.scale / 2 }));
      return;
    }
    const w = b.max[0] - b.min[0] + 8;
    const h = b.max[1] - b.min[1] + 8;
    const scale = Math.max(4, Math.min(30, Math.min(size.w / w, size.h / h)));
    setView({ scale, x: (b.min[0] + b.max[0]) / 2 - size.w / scale / 2, y: (b.min[1] + b.max[1]) / 2 - size.h / scale / 2 });
  }, [size]);

  // fit when a document is opened (and on first show)
  useEffect(() => {
    const onLoaded = () => requestAnimationFrame(fit);
    window.addEventListener('ffp:document-loaded', onLoaded);
    return () => window.removeEventListener('ffp:document-loaded', onLoaded);
  }, [fit]);
  const didFit = useRef(false);
  useEffect(() => {
    if (!didFit.current && size) {
      didFit.current = true;
      fit();
    }
  }, [fit, size]);

  // ---------------------------------------------------------------- actions

  const connectionAt = useCallback((p: Vec2, proj: Project): boolean => {
    for (const inst of Object.values(proj.schematic.instances)) {
      const sym = symbolOf(proj, inst);
      if (sym && instancePinPoints(inst, sym).some((x) => samePoint(x.point, p))) return true;
    }
    return Object.values(proj.schematic.wires).some((w) => pointOnSegment(p, w.a, w.b));
  }, []);

  const deleteSelected = useCallback(() => {
    const sel = getState().selection;
    if (!sel.instances.length && !sel.wires.length && !sel.labels.length) return;
    const placed = sel.instances.filter((id) => currentProject().layout.placements[id]).length;
    apply((p) => deleteSelection(p, sel));
    if (placed) notify('info', `Removed ${placed} part${placed === 1 ? '' : 's'} from the schematic and the 3D layout. Undo with Ctrl+Z.`);
  }, []);

  const rotateSelected = useCallback(() => {
    if (tool.kind === 'place') return setTool({ ...tool, rotation: ((tool.rotation + 90) % 360) as Rotation });
    const ids = getState().selection.instances;
    if (ids.length) apply((p) => ids.reduce(rotateInstance, p));
  }, [tool]);

  const mirrorSelected = useCallback(() => {
    if (tool.kind === 'place') return setTool({ ...tool, mirror: !tool.mirror });
    const ids = getState().selection.instances;
    if (ids.length) apply((p) => ids.reduce(mirrorInstance, p));
  }, [tool]);

  const runAnnotate = useCallback(() => {
    const before = currentProject();
    apply(annotate);
    notify('info', currentProject() === before ? 'All references are already unique.' : 'References annotated.');
  }, []);

  const switchTool = useCallback((t: Tool) => {
    setDraft(null);
    setTool(t);
  }, []);

  // ---------------------------------------------------------------- app bar menus

  useEffect(() => {
    setState({
      viewMenus: {
        edit: [
          { label: 'Rotate', shortcut: 'R', run: rotateSelected },
          { label: 'Mirror', shortcut: 'X', run: mirrorSelected },
          { label: 'Delete', shortcut: 'Del', run: deleteSelected },
        ],
        tools: [
          { label: 'Select', shortcut: 'Esc', active: tool.kind === 'select', run: () => switchTool({ kind: 'select' }) },
          { label: 'Wire', shortcut: 'W', active: tool.kind === 'wire', run: () => switchTool({ kind: 'wire' }), testId: 'tool-wire' },
          { label: 'Net label', shortcut: 'L', active: tool.kind === 'label', run: () => switchTool({ kind: 'label' }), testId: 'tool-label' },
          { label: 'Annotate', run: runAnnotate },
        ],
        view: [{ label: 'Zoom to fit', shortcut: 'Home', run: fit }],
      },
    });
  }, [tool, rotateSelected, mirrorSelected, deleteSelected, runAnnotate, switchTool, fit]);
  useEffect(() => () => setState({ viewMenus: null }), []);

  // ---------------------------------------------------------------- keyboard

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || prompt) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'a') {
          const p = currentProject();
          select({ instances: Object.keys(p.schematic.instances), wires: Object.keys(p.schematic.wires), labels: Object.keys(p.schematic.labels) });
          e.preventDefault();
        }
        return;
      }
      const key = e.key.toLowerCase();
      const actions: Record<string, () => void> = {
        escape: () => {
          if (draft) setDraft(null);
          else if (tool.kind !== 'select') switchTool({ kind: 'select' });
          else clearSelection();
        },
        w: () => switchTool({ kind: 'wire' }),
        l: () => switchTool({ kind: 'label' }),
        r: rotateSelected,
        x: mirrorSelected,
        delete: deleteSelected,
        backspace: deleteSelected,
        '/': () => setHorizontalFirst((h) => !h),
        home: fit,
      };
      const action = actions[key];
      if (action) {
        action();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, tool, prompt, rotateSelected, mirrorSelected, deleteSelected, fit, switchTool]);

  // ---------------------------------------------------------------- pointer

  const hitOf = (target: EventTarget | null): { kind: 'instance' | 'wire' | 'label'; id: string } | null => {
    const el = target instanceof Element ? target.closest('[data-hit]') : null;
    if (!el) return null;
    return { kind: el.getAttribute('data-hit') as 'instance' | 'wire' | 'label', id: el.getAttribute('data-id')! };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const raw = toGrid(e.clientX, e.clientY);
    const p = snap(raw);
    if (e.button === 1 || e.button === 2) {
      dragRef.current = { kind: 'pan', client: [e.clientX, e.clientY], origin: [view.x, view.y] };
      svgRef.current!.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    if (tool.kind === 'place') {
      let ids: string[] = [];
      apply((proj) => {
        const r = placePart(proj, getState().library, tool.partId, p, { rotation: tool.rotation, mirror: tool.mirror });
        ids = r.ids;
        return r.project;
      });
      if (ids.length) select({ instances: ids });
      return;
    }
    if (tool.kind === 'wire') {
      if (!draft) {
        setDraft(p);
        return;
      }
      const before = currentProject();
      const corner = routeCorner(draft, p, horizontalFirst);
      apply((proj) => addWire(addWire(proj, draft, corner).project, corner, p).project);
      setDraft(connectionAt(p, before) && !samePoint(p, draft) ? null : p);
      return;
    }
    if (tool.kind === 'label') {
      // keep the browser from moving focus away from the dialog's input on mousedown
      e.preventDefault();
      setPrompt({ kind: 'new', at: p });
      return;
    }

    // select tool
    const hit = hitOf(e.target);
    svgRef.current!.setPointerCapture(e.pointerId);
    if (hit) {
      const sel = getState().selection;
      const key = hit.kind === 'instance' ? 'instances' : hit.kind === 'wire' ? 'wires' : 'labels';
      if (e.shiftKey) {
        const list = sel[key].includes(hit.id) ? sel[key].filter((x) => x !== hit.id) : [...sel[key], hit.id];
        select({ ...sel, [key]: list });
        return;
      }
      if (!sel[key].includes(hit.id)) select({ [key]: [hit.id] } as Partial<AppSelection>);
      dragRef.current = { kind: 'move', last: p, key: `move:${e.timeStamp}` };
    } else {
      dragRef.current = { kind: 'box', start: raw, additive: e.shiftKey };
      if (!e.shiftKey) clearSelection();
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const raw = toGrid(e.clientX, e.clientY);
    const p = snap(raw);
    if (!samePoint(p, cursor)) setCursor(p);
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan') {
      setView((v) => ({ ...v, x: drag.origin[0] - (e.clientX - drag.client[0]) / v.scale, y: drag.origin[1] - (e.clientY - drag.client[1]) / v.scale }));
    } else if (drag.kind === 'move') {
      const delta: Vec2 = [p[0] - drag.last[0], p[1] - drag.last[1]];
      if (delta[0] || delta[1]) {
        apply((proj) => moveSelection(proj, getState().selection, delta), drag.key);
        drag.last = p;
      }
    } else {
      setBox(boxFromPoints(drag.start, raw));
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (!drag) return;
    if (drag.kind === 'move') endGesture();
    if (drag.kind === 'box') {
      const b = boxFromPoints(drag.start, toGrid(e.clientX, e.clientY));
      setBox(null);
      if (b.max[0] - b.min[0] < 0.2 && b.max[1] - b.min[1] < 0.2) return;
      const inside = itemsInBox(currentProject(), b);
      const base = drag.additive ? getState().selection : { instances: [], wires: [], labels: [], layoutWires: [] };
      select({
        instances: [...new Set([...base.instances, ...inside.instances])],
        wires: [...new Set([...base.wires, ...inside.wires])],
        labels: [...new Set([...base.labels, ...inside.labels])],
      });
    }
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const factor = Math.pow(1.0015, -e.deltaY);
    const at = toGrid(e.clientX, e.clientY);
    setView((v) => {
      const scale = Math.max(2, Math.min(80, v.scale * factor));
      return { scale, x: at[0] - (at[0] - v.x) * (v.scale / scale), y: at[1] - (at[1] - v.y) * (v.scale / scale) };
    });
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool.kind === 'wire') {
      setDraft(null);
      return;
    }
    const hit = hitOf(e.target);
    if (hit?.kind === 'label') setPrompt({ kind: 'rename', id: hit.id });
    if (hit?.kind === 'instance') setFocusRef((n) => n + 1);
  };

  // ---------------------------------------------------------------- render

  const w = (size?.w ?? 800) / view.scale;
  const h = (size?.h ?? 600) / view.scale;
  const ghostPart = tool.kind === 'place' ? project.library.parts[tool.partId] ?? getState().library.parts[tool.partId] : undefined;
  const ghostSymbol = ghostPart ? project.library.symbols[ghostPart.symbolId] ?? getState().library.symbols[ghostPart.symbolId] : undefined;
  const gridStep = view.scale < 6 ? 5 : 1;

  return (
    <div className="schematic-view">
      <div className="toolbar">
        <span className="toolbar-hint">{toolHint(tool, draft !== null, horizontalFirst)}</span>
      </div>
      <div className="schematic-body">
        <PartPicker active={tool.kind === 'place' ? tool.partId : null} onPick={(partId) => switchTool({ kind: 'place', partId, rotation: 0, mirror: false })} />
        <svg
          ref={svgRef}
          className={`sheet tool-${tool.kind}`}
          data-testid="schematic"
          viewBox={`${view.x} ${view.y} ${w} ${h}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <pattern id="grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
              <circle cx={0} cy={0} r={Math.max(0.06, 1.2 / view.scale)} className="grid-dot" />
            </pattern>
          </defs>
          <rect x={view.x - 1} y={view.y - 1} width={w + 2} height={h + 2} fill="url(#grid)" pointerEvents="none" />

          {Object.values(project.schematic.wires).map((wire) => (
            <g key={wire.id} data-hit="wire" data-id={wire.id} className={selected.has(wire.id) ? 'selected' : ''}>
              <line className="wire-hit" x1={wire.a[0]} y1={wire.a[1]} x2={wire.b[0]} y2={wire.b[1]} />
              <line className="wire" x1={wire.a[0]} y1={wire.a[1]} x2={wire.b[0]} y2={wire.b[1]} />
            </g>
          ))}
          {junctions.map((p) => (
            <circle key={`${p[0]},${p[1]}`} className="junction" cx={p[0]} cy={p[1]} r={0.35} />
          ))}

          {Object.values(project.schematic.instances).map((inst) => {
            const symbol = instanceSymbol(project, inst);
            if (!symbol) return null;
            const b = placedBounds(symbol, inst.at, inst.rotation, inst.mirror);
            const ref = displayRef(project, inst);
            return (
              <g key={inst.id} data-hit="instance" data-id={inst.id} data-ref={ref} className={`instance ${selected.has(inst.id) ? 'selected' : ''}`}>
                <rect className="hit-area" x={b.min[0] - HIT_MARGIN} y={b.min[1] - HIT_MARGIN} width={b.max[0] - b.min[0] + 2 * HIT_MARGIN} height={b.max[1] - b.min[1] + 2 * HIT_MARGIN} />
                <SymbolGraphics symbol={symbol} at={inst.at} rotation={inst.rotation} mirror={inst.mirror} refText={ref} valueText={inst.value} />
              </g>
            );
          })}

          {Object.values(project.schematic.labels).map((label) => {
            const width = label.name.length * 0.75 + 0.8;
            return (
              <g key={label.id} data-hit="label" data-id={label.id} className={`net-label ${selected.has(label.id) ? 'selected' : ''}`}>
                <rect className="hit-area" x={label.at[0] - 0.3} y={label.at[1] - 1.5} width={width} height={1.8} />
                <path className="label-flag" d={`M${label.at[0]} ${label.at[1]} l0.4 -0.4`} />
                <text x={label.at[0] + 0.4} y={label.at[1] - 0.45}>
                  {label.name}
                </text>
                <rect className="label-anchor" x={label.at[0] - 0.15} y={label.at[1] - 0.15} width={0.3} height={0.3} />
              </g>
            );
          })}

          {tool.kind === 'place' && ghostSymbol && (
            <g className="ghost" pointerEvents="none">
              {unitOffsets(ghostSymbol).map((offset, k) => (
                <SymbolGraphics key={k} symbol={symbolUnit(ghostSymbol, k + 1)} at={transformPoint2(cursor, tool.rotation, tool.mirror, offset)} rotation={tool.rotation} mirror={tool.mirror} />
              ))}
            </g>
          )}
          {tool.kind === 'wire' && draft && (
            <polyline className="wire draft" points={[draft, routeCorner(draft, cursor, horizontalFirst), cursor].map((p) => p.join(',')).join(' ')} pointerEvents="none" />
          )}
          {(tool.kind === 'wire' || tool.kind === 'label') && <circle className="cursor-dot" cx={cursor[0]} cy={cursor[1]} r={0.25} pointerEvents="none" />}
          {box && <rect className="select-box" x={box.min[0]} y={box.min[1]} width={box.max[0] - box.min[0]} height={box.max[1] - box.min[1]} pointerEvents="none" />}
        </svg>
        <SchematicProperties netlist={netlist} focusRef={focusRef} onRenameLabel={(id) => setPrompt({ kind: 'rename', id })} />
      </div>
      {prompt && (
        <PromptDialog
          title={prompt.kind === 'new' ? 'Net label' : 'Rename net label'}
          label="Net name"
          initial={prompt.kind === 'new' ? lastLabel : project.schematic.labels[prompt.id]?.name ?? ''}
          onCancel={() => setPrompt(null)}
          onSubmit={(name) => {
            if (prompt.kind === 'new') {
              apply((p) => addLabel(p, prompt.at, name).project);
              setLastLabel(nextLabelName(name));
            } else apply((p) => renameLabel(p, prompt.id, name));
            setPrompt(null);
          }}
        />
      )}
    </div>
  );
}

function toolHint(tool: Tool, drafting: boolean, horizontalFirst: boolean): string {
  switch (tool.kind) {
    case 'select':
      return 'Drag to move · Shift-click to add · Right/middle-drag to pan · Wheel to zoom';
    case 'wire':
      return drafting ? `Click to add a corner (${horizontalFirst ? 'horizontal' : 'vertical'} first, / to toggle) · double-click or Esc to finish` : 'Click to start a wire';
    case 'label':
      return 'Click on a wire end or pin to place a net label';
    case 'place':
      return 'Click to place · R rotate · X mirror · Esc to stop';
  }
}

/** NET1 -> NET2, keeps names without a trailing number. */
function nextLabelName(name: string): string {
  const m = /^(.*?)(\d+)$/.exec(name);
  return m ? `${m[1]}${Number(m[2]) + 1}` : name;
}

function itemsInBox(p: Project, b: Box): { instances: string[]; wires: string[]; labels: string[] } {
  const instances = Object.values(p.schematic.instances)
    .filter((i) => {
      const s = instanceSymbol(p, i);
      return s && boxContains(b, placedBounds(s, i.at, i.rotation, i.mirror));
    })
    .map((i) => i.id);
  const wires = Object.values(p.schematic.wires)
    .filter((w) => pointInBox(w.a, b) && pointInBox(w.b, b))
    .map((w) => w.id);
  const labels = Object.values(p.schematic.labels)
    .filter((l) => pointInBox(l.at, b))
    .map((l) => l.id);
  return { instances, wires, labels };
}

function sheetBounds(p: Project): Box {
  let b = emptyBox();
  for (const i of Object.values(p.schematic.instances)) {
    const s = instanceSymbol(p, i);
    if (!s) continue;
    const ib = placedBounds(s, i.at, i.rotation, i.mirror);
    b = growBox(growBox(b, ib.min), ib.max);
  }
  for (const w of Object.values(p.schematic.wires)) b = growBox(growBox(b, w.a), w.b);
  for (const l of Object.values(p.schematic.labels)) b = growBox(b, l.at, 2);
  return b;
}
