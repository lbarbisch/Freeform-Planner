import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
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
  setTransforms,
  setVariant,
  setWireFootprint,
  translate,
  wireFootprints,
  writeObj,
  type Airwire,
  type Vec3,
} from '../core';
import { apply, endGesture, getState, notify, project as currentProject, select, useApp } from '../app/store';
import { downloadBlob } from '../app/persistence';
import { isTypingTarget } from '../app/keyboard';
import { LayoutScene, type Pick, type Transforms } from './LayoutScene';
import { SpaceMouse } from './spaceMouse';

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
  const [gizmo, setGizmo] = useState<GizmoMode>('translate');
  const [airwire, setAirwire] = useState<number | null>(null);
  const [airwires, setAirwires] = useState<Airwire[]>([]);
  const [loading, setLoading] = useState(0);
  const [spaceMouseState, setSpaceMouseState] = useState<'unsupported' | 'idle' | 'connected'>(() => (SpaceMouse.supported ? 'idle' : 'unsupported'));
  const spaceMouseRef = useRef<SpaceMouse | null>(null);

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
    const sm = new SpaceMouse(scene);
    spaceMouseRef.current = sm;
    sm.onStatus = (connected) => setSpaceMouseState(connected ? 'connected' : 'idle');
    void sm.reconnect();
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
      sm.dispose();
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

  // keyboard: same bindings as v0.1.x (configurable in settings)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = settings.keys;
      const key = e.key.toLowerCase();
      const scene = sceneRef.current;
      const sel = getState().selection;
      const targets = [...sel.instances.filter((id) => currentProject().layout.placements[id]), ...sel.layoutWires];

      if (key === k.insertWire && airwire !== null && scene) {
        const aw = scene.airwires[airwire];
        if (!aw) return;
        const p = currentProject();
        const netlist = deriveNetlist(p);
        const net = netlist.nets.find((n) => n.name === aw.net);
        const anchor = net?.nodes[0];
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
        e.preventDefault();
        return;
      }
      if ((key === 'delete' || key === 'backspace') && sel.layoutWires.length) {
        apply((p) => sel.layoutWires.reduce(removeLayoutWire, p));
        e.preventDefault();
        return;
      }
      if (key === 'home') {
        scene?.frameAll();
        return;
      }
      if (key === 'escape') {
        setAirwire(null);
        select({});
        return;
      }
      if (key === 't') return setGizmo('translate');
      if (key === 'g') return setGizmo((g) => (g === 'rotate' ? 'translate' : 'rotate'));
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
  }, [settings, airwire]);

  const exportObj = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const base = (getState().fileName ?? currentProject().name ?? 'layout').replace(/\.ffp\.json$|\.json$/i, '');
    const { obj, mtl } = writeObj(scene.collectExport(), `${base}.mtl`);
    downloadBlob(`${base}.obj`, new Blob([obj], { type: 'model/obj' }));
    downloadBlob(`${base}.mtl`, new Blob([mtl], { type: 'text/plain' }));
    notify('info', `Exported ${base}.obj and ${base}.mtl`);
  };

  return (
    <div className="layout-view">
      <div className="toolbar" role="toolbar" aria-label="3D tools">
        <button className={gizmo === 'translate' ? 'active' : ''} onClick={() => setGizmo('translate')} title="Move gizmo (T)">
          Move
        </button>
        <button className={gizmo === 'rotate' ? 'active' : ''} onClick={() => setGizmo('rotate')} title="Rotate gizmo (G)">
          Rotate
        </button>
        <button className={gizmo === 'off' ? 'active' : ''} onClick={() => setGizmo('off')} title="Hide gizmo">
          No gizmo
        </button>
        <span className="sep" />
        <button onClick={() => sceneRef.current?.frameAll()} title="Frame all (Home)">
          Frame all
        </button>
        <button onClick={exportObj} data-testid="export-obj">
          Export OBJ
        </button>
        {spaceMouseState !== 'unsupported' && (
          <button onClick={() => void spaceMouseRef.current?.request()} title="Connect a 3Dconnexion SpaceMouse (WebHID)">
            {spaceMouseState === 'connected' ? 'SpaceMouse ✓' : 'Connect SpaceMouse'}
          </button>
        )}
      </div>
      <div className="layout-body">
        <div className="canvas-host" ref={containerRef} data-testid="layout-canvas" data-airwires={airwires.length} data-loading={loading} />
        <LayoutInfo airwire={airwire} airwires={airwires} />
      </div>
    </div>
  );
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function fmt3(v: Vec3): string {
  return v.map((n) => round(n, 2)).join(', ');
}

function eulerDeg(q: [number, number, number, number]): string {
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...q), 'XYZ');
  return [e.x, e.y, e.z].map((r) => round(THREE.MathUtils.radToDeg(r), 1)).join(', ');
}

function LayoutInfo({ airwire, airwires }: { airwire: number | null; airwires: Airwire[] }) {
  const project = useApp((s) => s.history.present);
  const selection = useApp((s) => s.selection);
  const keys = useApp((s) => s.settings.keys);
  const library = useApp((s) => s.library);
  const netlist = useMemo(() => deriveNetlist(project), [project]);
  const shapes = useMemo(() => wireFootprints(project, library), [project, library]);
  const ids = [...selection.instances, ...selection.layoutWires];

  let body: React.ReactNode = <p className="muted">Nothing selected. Left-click a part, wire or airwire.</p>;
  const aw = airwire !== null ? airwires[airwire] : undefined;
  if (aw) {
    body = (
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
        <dd className="hint">Press {keys.insertWire.toUpperCase()} to insert a wire</dd>
      </dl>
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
      body = (
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
          <dt>Position</dt>
          <dd>{fmt3(t.position)}</dd>
          <dt>Rotation (XYZ°)</dt>
          <dd>{eulerDeg(t.rotation)}</dd>
        </dl>
      );
    }
  } else if (ids.length > 1) {
    body = (
      <p>
        {ids.length} objects selected. The gizmo moves and turns them together around their common center.
      </p>
    );
  }
  return <aside className="side-panel">{body}</aside>;
}
