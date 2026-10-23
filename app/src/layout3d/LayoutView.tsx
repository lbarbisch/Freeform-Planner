import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cycleVariant,
  deriveNetlist,
  rotateGroup,
  getTransform,
  insertLayoutWire,
  layoutWireLabel,
  removeLayoutWire,
  resetRotation,
  resolvePlacement,
  round,
  setTransform,
  setTransforms,
  setVariant,
  setWireFootprint,
  translate,
  wireFootprints,
  writeObj,
  type Airwire,
  type Vec3,
} from '../core';
import { apply, endGesture, getState, notify, project as currentProject, select, setState, useApp } from '../app/store';
import { downloadBlob } from '../app/persistence';
import { NumberField } from '../app/fields';
import { isTypingTarget } from '../app/keyboard';
import { keyCombo, keyLabel } from '../app/settings';
import { LayoutScene, type Pick, type Transforms } from './LayoutScene';
import { eulerDeg, quatFromEulerDeg } from './models';
import { attachSpaceMouse, spaceMouseMenu } from './spaceMouse';

type GizmoMode = 'translate' | 'rotate' | 'off';

declare global {
  interface Window {
    __ffpLayout?: LayoutScene;
  }
}

export function LayoutView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LayoutScene | null>(null);
  const project = useApp((s) => s.history.present);
  const selection = useApp((s) => s.selection);
  const settings = useApp((s) => s.settings);
  const spaceMouse = useApp((s) => s.spaceMouse);
  const [gizmo, setGizmo] = useState<GizmoMode>('translate');
  const [airwire, setAirwire] = useState<number | null>(null);
  const [airwires, setAirwires] = useState<Airwire[]>([]);
  const [loading, setLoading] = useState(0);

  const selectedIds = useMemo(() => new Set([...selection.instances, ...selection.layoutWires]), [selection]);

  // create the scene once
  useEffect(() => {
    const container = containerRef.current!;
    const scene = new LayoutScene(container, {
      onPick: (pick: Pick, additive: boolean) => {
        if (pick?.kind === 'airwire') {
          setAirwire(pick.index);
          select({});
          return;
        }
        setAirwire(null);
        if (!pick) return select({});
        const s = getState().selection;
        if (pick.kind === 'placement') {
          const instances = additive ? toggle(s.instances, pick.id) : [pick.id];
          select({ instances, layoutWires: additive ? s.layoutWires : [] });
        } else {
          const layoutWires = additive ? toggle(s.layoutWires, pick.id) : [pick.id];
          select({ layoutWires, instances: additive ? s.instances : [] });
        }
      },
      onBoxSelect: (ids: string[], additive: boolean) => {
        setAirwire(null);
        const wires = currentProject().layout.wires;
        const s = getState().selection;
        const instances = ids.filter((id) => !wires[id]);
        const layoutWires = ids.filter((id) => wires[id]);
        select(additive ? { instances: [...new Set([...s.instances, ...instances])], layoutWires: [...new Set([...s.layoutWires, ...layoutWires])] } : { instances, layoutWires });
      },
      onGizmoChange: (transforms: Transforms) => {
        const rounded: Transforms = {};
        for (const [id, t] of Object.entries(transforms)) rounded[id] = { position: t.position.map((v) => round(v, 4)) as Vec3, rotation: t.rotation };
        apply((p) => setTransforms(p, rounded), `gizmo:${Object.keys(transforms).join(',')}`);
      },
      onGizmoEnd: () => endGesture(),
    });
    scene.onFrame = () => {
      setAirwires(scene.airwires);
      setLoading(scene.loading);
    };
    sceneRef.current = scene;
    window.__ffpLayout = scene;
    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(container);
    const detachSpaceMouse = attachSpaceMouse(scene);
    // frame once the first models are in
    let framed = false;
    const frameWhenLoaded = window.setInterval(() => {
      if (scene.loading === 0 && !framed) {
        framed = true;
        scene.frameAll();
        window.clearInterval(frameWhenLoaded);
      }
    }, 100);
    return () => {
      window.clearInterval(frameWhenLoaded);
      ro.disconnect();
      detachSpaceMouse();
      scene.dispose();
      sceneRef.current = null;
      if (window.__ffpLayout === scene) delete window.__ffpLayout;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.airwireThickness = settings.airwireThickness;
    scene.update(project, selectedIds, gizmo, { translate: settings.translationIncrement, rotate: settings.rotationIncrement });
    sceneRef.current?.selectAirwire(airwire);
  }, [project, selectedIds, gizmo, settings, airwire]);

  // ---------------------------------------------------------------- actions

  const insertWire = useCallback((index: number) => {
    const aw = sceneRef.current?.airwires[index];
    if (!aw) return;
    const netlist = deriveNetlist(currentProject());
    const anchor = netlist.nets.find((n) => n.name === aw.net)?.nodes[0];
    if (!anchor) return;
    let newId: string | null = null;
    apply((proj) => {
      const r = insertLayoutWire(proj, getState().library, anchor, aw.from.position);
      newId = r.id;
      return r.project;
    });
    if (newId) {
      setAirwire(null);
      select({ layoutWires: [newId] });
    } else notify('warning', 'The library has no wire footprints.');
  }, []);

  const deleteWires = useCallback(() => {
    const ids = getState().selection.layoutWires;
    if (ids.length) apply((p) => ids.reduce(removeLayoutWire, p));
  }, []);

  const selectAll = useCallback(() => {
    const p = currentProject();
    setAirwire(null);
    select({ instances: Object.keys(p.layout.placements), layoutWires: Object.keys(p.layout.wires) });
  }, []);

  const zoomToFit = useCallback(() => sceneRef.current?.frameAll(), []);

  const exportObj = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const base = (getState().fileName ?? currentProject().name ?? 'layout').replace(/\.ffp\.json$|\.json$/i, '');
    const { obj, mtl } = writeObj(scene.collectExport(), `${base}.mtl`);
    downloadBlob(`${base}.obj`, new Blob([obj], { type: 'model/obj' }));
    downloadBlob(`${base}.mtl`, new Blob([mtl], { type: 'text/plain' }));
    notify('info', `Exported ${base}.obj and ${base}.mtl`);
  }, []);

  // ---------------------------------------------------------------- app bar menus

  useEffect(() => {
    setState({
      viewMenus: {
        file: [{ label: 'Export OBJ…', run: exportObj, testId: 'export-obj' }],
        edit: [
          { label: 'Select all', shortcut: 'Ctrl+A', run: selectAll },
          { label: 'Delete wire', shortcut: 'Del', run: deleteWires },
        ],
        tools: [
          { label: 'Move', shortcut: 'M', active: gizmo === 'translate', run: () => setGizmo('translate') },
          { label: 'Rotate', shortcut: 'R', active: gizmo === 'rotate', run: () => setGizmo('rotate') },
          { label: 'No gizmo', active: gizmo === 'off', run: () => setGizmo('off') },
        ],
        view: [
          { label: 'Zoom to fit', shortcut: 'Home', run: zoomToFit },
          ...spaceMouseMenu(spaceMouse),
        ],
      },
    });
  }, [gizmo, spaceMouse, exportObj, selectAll, deleteWires, zoomToFit]);
  useEffect(() => () => setState({ viewMenus: null }), []);

  // ---------------------------------------------------------------- keyboard

  // same bindings as v0.1.x (configurable in settings)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.altKey) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'a') {
          selectAll();
          e.preventDefault();
        }
        return;
      }
      const k = settings.keys;
      const key = keyCombo(e);
      const sel = getState().selection;
      const targets = [...sel.instances.filter((id) => currentProject().layout.placements[id]), ...sel.layoutWires];

      if (key === k.insertWire && airwire !== null) {
        insertWire(airwire);
        e.preventDefault();
        return;
      }
      if ((key === 'delete' || key === 'backspace') && sel.layoutWires.length) {
        deleteWires();
        e.preventDefault();
        return;
      }
      if (key === 'home') return zoomToFit();
      if (key === 'escape') {
        setAirwire(null);
        select({});
        return;
      }
      if (key === 'm') return setGizmo('translate');
      if (key === 'r') return setGizmo('rotate');
      if (targets.length === 0) return;

      const step = settings.translationIncrement;
      const deg = settings.rotationIncrement;
      const moves: Record<string, Vec3> = {
        [k.translateXPos]: [step, 0, 0],
        [k.translateXNeg]: [-step, 0, 0],
        [k.translateYPos]: [0, step, 0],
        [k.translateYNeg]: [0, -step, 0],
        [k.translateZPos]: [0, 0, step],
        [k.translateZNeg]: [0, 0, -step],
      };
      const turns: Record<string, [Vec3, number]> = {
        [k.rotateXPos]: [[1, 0, 0], deg],
        [k.rotateXNeg]: [[1, 0, 0], -deg],
        [k.rotateYPos]: [[0, 1, 0], deg],
        [k.rotateYNeg]: [[0, 1, 0], -deg],
        [k.rotateZPos]: [[0, 0, 1], deg],
        [k.rotateZNeg]: [[0, 0, 1], -deg],
      };
      const keyId = `key:${key}:${targets.join(',')}`;
      if (moves[key]) {
        apply((p) => targets.reduce((acc, id) => translate(acc, id, moves[key]!), p), e.repeat ? keyId : null);
      } else if (turns[key]) {
        const [axis, d] = turns[key]!;
        // several objects turn together around their common center
        apply((p) => rotateGroup(p, targets, axis, d), e.repeat ? keyId : null);
      } else if (key === k.resetRotation) {
        apply((p) => targets.reduce(resetRotation, p));
      } else if (key === k.swapFootprint) {
        apply((p) => targets.reduce(cycleVariant, p));
      } else return;
      e.preventDefault();
    };
    const onKeyUp = () => endGesture();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [settings, airwire, insertWire, deleteWires, selectAll, zoomToFit]);

  return (
    <div className="layout-view">
      <div className="layout-body">
        <div className="canvas-host" ref={containerRef} data-testid="layout-canvas" data-airwires={airwires.length} data-loading={loading} />
        <LayoutInfo airwire={airwire} airwires={airwires} onInsertWire={insertWire} onDeleteWires={deleteWires} />
      </div>
    </div>
  );
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

const AXES = ['X', 'Y', 'Z'] as const;

function LayoutInfo({ airwire, airwires, onInsertWire, onDeleteWires }: { airwire: number | null; airwires: Airwire[]; onInsertWire: (index: number) => void; onDeleteWires: () => void }) {
  const project = useApp((s) => s.history.present);
  const selection = useApp((s) => s.selection);
  const keys = useApp((s) => s.settings.keys);
  const library = useApp((s) => s.library);
  const netlist = useMemo(() => deriveNetlist(project), [project]);
  const shapes = useMemo(() => wireFootprints(project, library), [project, library]);
  const ids = [...selection.instances, ...selection.layoutWires];

  let body: React.ReactNode = <p className="muted">Nothing selected. Left-click a part, wire or airwire, or drag a box to select several.</p>;
  const aw = airwire !== null ? airwires[airwire] : undefined;
  if (aw) {
    body = (
      <>
        <dl data-testid="layout-info">
          <dt>Airwire</dt>
          <dd>{aw.net}</dd>
          <dt>From</dt>
          <dd>
            {aw.from.label}.{aw.from.pin}
          </dd>
          <dt>To</dt>
          <dd>
            {aw.to.label}.{aw.to.pin}
          </dd>
        </dl>
        <div className="actions">
          <button onClick={() => onInsertWire(airwire!)} title={`Insert a wire on this airwire (${keyLabel(keys.insertWire)})`} data-testid="insert-wire">
            Insert wire
          </button>
        </div>
      </>
    );
  } else if (ids.length === 1) {
    const id = ids[0]!;
    const r = resolvePlacement(project, id);
    const wire = project.layout.wires[id];
    const t = getTransform(project, id);
    if (t && (r || wire)) {
      const netNames = r
        ? [...new Set(r.part.variants.length ? Object.keys(r.variant.pinMap).map((pin) => netlist.nets[netlist.netOfPin.get(`${id}:${pin}`) ?? -1]?.name).filter(Boolean) : [])]
        : [netlist.nets[netlist.netOfPin.get(`${wire!.netAnchor.instanceId}:${wire!.netAnchor.pin}`) ?? -1]?.name ?? '(no net)'];
      const euler = eulerDeg(t.rotation);
      body = (
        <>
          <dl data-testid="layout-info">
            <dt>Designator</dt>
            <dd>{r ? r.instance.ref : layoutWireLabel(project, id)}</dd>
            {r && (
              <>
                <dt>Value</dt>
                <dd>{r.instance.value}</dd>
                <dt>Footprint</dt>
                <dd>
                  <select
                    value={Math.min(r.placement.variant, r.part.variants.length - 1)}
                    onChange={(e) => apply((p) => setVariant(p, id, Number(e.target.value)))}
                    disabled={r.part.variants.length < 2}
                    aria-label="Footprint variant"
                    data-testid="footprint-variant"
                  >
                    {r.part.variants.map((v, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {project.library.footprints[v.footprintId]?.name ?? v.footprintId}
                      </option>
                    ))}
                  </select>
                </dd>
              </>
            )}
            {wire && (
              <>
                <dt>Footprint</dt>
                <dd>
                  <select
                    value={wire.footprintId}
                    onChange={(e) => apply((p) => setWireFootprint(p, getState().library, id, e.target.value))}
                    aria-label="Wire footprint"
                    data-testid="wire-footprint"
                  >
                    {shapes.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </dd>
              </>
            )}
            <dt>Nets</dt>
            <dd>{netNames.join(', ') || '–'}</dd>
          </dl>
          <h4>Position (mm)</h4>
          <div className="row transform-row">
            {AXES.map((axis, i) => (
              <NumberField
                key={axis}
                compact
                label={axis}
                value={round(t.position[i]!, 4)}
                testId={`position-${axis.toLowerCase()}`}
                onCommit={(v) => apply((p) => setTransform(p, id, { position: t.position.map((c, j) => (j === i ? v : c)) as Vec3 }))}
              />
            ))}
          </div>
          <h4>Rotation (°)</h4>
          <div className="row transform-row">
            {AXES.map((axis, i) => (
              <NumberField
                key={axis}
                compact
                step={15}
                label={axis}
                value={euler[i]!}
                testId={`rotation-${axis.toLowerCase()}`}
                onCommit={(v) => apply((p) => setTransform(p, id, { rotation: quatFromEulerDeg(euler.map((c, j) => (j === i ? v : c)) as Vec3) }))}
              />
            ))}
          </div>
          {wire && (
            <div className="actions">
              <button onClick={onDeleteWires} title="Delete this wire (Del)" data-testid="delete-wire">
                Delete wire
              </button>
            </div>
          )}
        </>
      );
    }
  } else if (ids.length > 1) {
    const wireCount = selection.layoutWires.length;
    body = (
      <>
        <p>
          {ids.length} objects selected. The gizmo moves and turns them together around their common center.
        </p>
        {wireCount > 0 && (
          <div className="actions">
            <button onClick={onDeleteWires} data-testid="delete-wire">
              Delete {wireCount} wire{wireCount === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </>
    );
  }
  return <aside className="side-panel">{body}</aside>;
}
