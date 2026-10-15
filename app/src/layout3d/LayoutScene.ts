/** Three.js scene for the 3D layout. It is a view of the project: `update()` reconciles scene
 * objects with the project data, nothing in here owns state that is saved. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { computeAirwires, deriveNetlist, layoutWireLabel, resolvePlacement, type Airwire, type ExportGroup, type FootprintDef, type Project, type Quat, type Vec3 } from '../core';
import { applyModelTransform, cloneWithMaterials, loadModel, setHighlight } from './models';

export type Pick = { kind: 'placement'; id: string } | { kind: 'wire'; id: string } | { kind: 'airwire'; index: number } | null;

export interface SceneCallbacks {
  onPick: (pick: Pick, additive: boolean) => void;
  /** live transform from the gizmo */
  onGizmoChange: (id: string, position: Vec3, rotation: Quat) => void;
  onGizmoEnd: () => void;
}

interface Entry {
  object: THREE.Group;
  footprintId: string;
  modelKey: string;
}

const SELECT_COLOR = 0x2f8f2f;
const AIRWIRE_COLOR = 0xf2d000;
const AIRWIRE_SELECTED = 0x33ff66;

export class LayoutScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5000);
  readonly orbit: OrbitControls;
  readonly gizmo: TransformControls;

  private entries = new Map<string, Entry>();
  private airwireGroup = new THREE.Group();
  private pinGroup = new THREE.Group();
  private airwireGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1).rotateX(Math.PI / 2);
  // airwires are drawn on top of everything so they stay visible (and clickable) inside parts
  private airwireMaterial = new THREE.MeshBasicMaterial({ color: AIRWIRE_COLOR, depthTest: false });
  private airwireSelectedMaterial = new THREE.MeshBasicMaterial({ color: AIRWIRE_SELECTED, depthTest: false });
  private pinMaterial = new THREE.MeshBasicMaterial({ color: 0xff4040, depthTest: false });
  private pinGeometry = new THREE.SphereGeometry(0.45, 12, 8);
  private frameRequested = false;
  private pendingLoads = 0;
  private disposed = false;
  private project: Project | null = null;
  private selected = new Set<string>();
  private gizmoTarget = new THREE.Object3D();
  private gizmoId: string | null = null;
  private ignoreGizmo = false;

  airwires: Airwire[] = [];
  selectedAirwire: number | null = null;
  airwireThickness = 0.2;
  onFrame: (() => void) | null = null;

  constructor(
    private container: HTMLElement,
    private callbacks: SceneCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x2b2f36);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(80, 150, 60);
    this.scene.add(sun);
    const grid = new THREE.GridHelper(400, 40, 0x555b66, 0x3a3f48);
    grid.position.y = -0.01;
    grid.userData.pickable = false;
    this.scene.add(grid);
    this.scene.add(axes());
    this.scene.add(this.airwireGroup, this.pinGroup, this.gizmoTarget);

    this.camera.position.set(80, 120, 160);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    // same mouse mapping as v0.1.x: right = orbit, middle = pan, wheel = zoom, left = select
    this.orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.orbit.zoomToCursor = true;
    this.orbit.addEventListener('change', () => this.invalidate());

    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSize(0.8);
    this.gizmo.addEventListener('change', () => this.invalidate());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      if (!e.value) this.callbacks.onGizmoEnd();
    });
    this.gizmo.addEventListener('objectChange', () => {
      if (this.ignoreGizmo || !this.gizmoId) return;
      const t = this.gizmoTarget;
      this.callbacks.onGizmoChange(this.gizmoId, t.position.toArray() as Vec3, t.quaternion.toArray() as Quat);
    });
    this.scene.add(this.gizmo.getHelper());

    this.installPicking();
    this.resize();
  }

  // ---------------------------------------------------------------- lifecycle

  resize(): void {
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  invalidate(): void {
    if (this.frameRequested || this.disposed) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera);
      this.onFrame?.();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.gizmo.dispose();
    this.orbit.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  get loading(): number {
    return this.pendingLoads;
  }

  // ---------------------------------------------------------------- sync

  update(project: Project, selected: Set<string>, gizmoMode: 'translate' | 'rotate' | 'off', snap: { translate: number; rotate: number }): void {
    this.project = project;
    this.selected = selected;
    const live = new Set<string>();

    for (const id of Object.keys(project.layout.placements)) {
      const r = resolvePlacement(project, id);
      if (!r) continue;
      live.add(id);
      this.syncEntry(id, r.footprint, r.placement.position, r.placement.rotation, { kind: 'placement', id });
    }
    for (const wire of Object.values(project.layout.wires)) {
      const fp = project.library.footprints[wire.footprintId];
      if (!fp) continue;
      live.add(wire.id);
      this.syncEntry(wire.id, fp, wire.position, wire.rotation, { kind: 'wire', id: wire.id });
    }
    for (const [id, entry] of this.entries) {
      if (!live.has(id)) {
        this.scene.remove(entry.object);
        this.entries.delete(id);
      }
    }
    for (const [id, entry] of this.entries) setHighlight(entry.object, selected.has(id) ? SELECT_COLOR : null);

    this.updateAirwires(project);
    this.updatePins(project);
    this.updateGizmo(gizmoMode, snap);
    this.invalidate();
  }

  private syncEntry(id: string, fp: FootprintDef, position: Vec3, rotation: Quat, pick: Pick): void {
    const modelKey = JSON.stringify([fp.model.kind === 'asset' ? fp.model.path : fp.model, fp.modelRotation, fp.modelOffset, fp.modelScale]);
    let entry = this.entries.get(id);
    if (entry && (entry.footprintId !== fp.id || entry.modelKey !== modelKey)) {
      this.scene.remove(entry.object);
      entry = undefined;
    }
    if (!entry) {
      const object = new THREE.Group();
      object.name = id;
      object.userData.pick = pick;
      this.scene.add(object);
      entry = { object, footprintId: fp.id, modelKey };
      this.entries.set(id, entry);
      const target = entry;
      this.pendingLoads++;
      loadModel(fp.model)
        .then((template) => {
          if (this.entries.get(id) !== target) return;
          const model = cloneWithMaterials(template);
          applyModelTransform(model, fp);
          target.object.add(model);
          setHighlight(target.object, this.selected.has(id) ? SELECT_COLOR : null);
        })
        .finally(() => {
          this.pendingLoads--;
          this.invalidate();
        });
    }
    entry.object.userData.pick = pick;
    entry.object.position.set(...position);
    entry.object.quaternion.set(...rotation);
  }

  private updateAirwires(project: Project): void {
    const netlist = deriveNetlist(project);
    this.airwires = computeAirwires(project, netlist);
    if (this.selectedAirwire !== null && this.selectedAirwire >= this.airwires.length) this.selectedAirwire = null;
    const meshes = this.airwireGroup.children as THREE.Mesh[];
    while (meshes.length > this.airwires.length) this.airwireGroup.remove(meshes[meshes.length - 1]!);
    while (meshes.length < this.airwires.length) {
      const mesh = new THREE.Mesh(this.airwireGeometry, this.airwireMaterial);
      mesh.renderOrder = 5;
      this.airwireGroup.add(mesh);
    }
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    this.airwires.forEach((w, i) => {
      const mesh = meshes[i]!;
      a.set(...w.from.position);
      b.set(...w.to.position);
      const len = a.distanceTo(b);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.scale.set(this.airwireThickness / 2, this.airwireThickness / 2, Math.max(len, 1e-3));
      if (len > 1e-6) mesh.lookAt(b);
      mesh.material = i === this.selectedAirwire ? this.airwireSelectedMaterial : this.airwireMaterial;
      mesh.userData.pick = { kind: 'airwire', index: i } satisfies Pick;
    });
  }

  /** Shows the pin anchors of selected objects. */
  private updatePins(project: Project): void {
    this.pinGroup.clear();
    for (const id of this.selected) {
      const r = resolvePlacement(project, id);
      const wire = project.layout.wires[id];
      const fp = r?.footprint ?? (wire && project.library.footprints[wire.footprintId]);
      const t = r?.placement ?? wire;
      if (!fp || !t) continue;
      const q = new THREE.Quaternion(...t.rotation);
      for (const pin of fp.pins) {
        const m = new THREE.Mesh(this.pinGeometry, this.pinMaterial);
        m.position.set(...pin.position).applyQuaternion(q).add(new THREE.Vector3(...t.position));
        m.renderOrder = 10;
        m.userData.pickable = false;
        this.pinGroup.add(m);
      }
    }
  }

  private updateGizmo(mode: 'translate' | 'rotate' | 'off', snap: { translate: number; rotate: number }): void {
    const ids = [...this.selected].filter((id) => this.entries.has(id));
    const id = ids.length === 1 ? ids[0]! : null;
    if (mode === 'off' || !id) {
      this.gizmo.detach();
      this.gizmoId = null;
      return;
    }
    const obj = this.entries.get(id)!.object;
    this.ignoreGizmo = true;
    this.gizmoTarget.position.copy(obj.position);
    this.gizmoTarget.quaternion.copy(obj.quaternion);
    this.gizmoTarget.updateMatrixWorld();
    this.ignoreGizmo = false;
    if (this.gizmoId !== id) this.gizmo.attach(this.gizmoTarget);
    this.gizmoId = id;
    this.gizmo.setMode(mode);
    this.gizmo.setTranslationSnap(snap.translate);
    this.gizmo.setRotationSnap(THREE.MathUtils.degToRad(snap.rotate));
  }

  selectAirwire(index: number | null): void {
    this.selectedAirwire = index;
    if (this.project) this.updateAirwires(this.project);
    this.invalidate();
  }

  // ---------------------------------------------------------------- picking

  private installPicking(): void {
    const el = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 0) down = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 4 || this.gizmo.dragging) return;
      // the gizmo consumes clicks on its handles
      if (this.gizmo.axis !== null) return;
      this.callbacks.onPick(this.pickAt(e.clientX, e.clientY), e.shiftKey || e.ctrlKey);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pickAt(clientX: number, clientY: number): Pick {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    // airwires are drawn on top, so they win over parts behind them
    const airwireHit = ray.intersectObject(this.airwireGroup, true)[0];
    if (airwireHit) return airwireHit.object.userData.pick as Pick;
    const targets = [...this.entries.values()].map((e) => e.object);
    for (const hit of ray.intersectObjects(targets, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o?.userData.pick) return o.userData.pick as Pick;
    }
    return null;
  }

  /** Screen position (client coordinates) of a world point; used by end-to-end tests. */
  project3d(p: Vec3): { x: number; y: number } {
    const v = new THREE.Vector3(...p).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  // ---------------------------------------------------------------- camera

  frameAll(): void {
    const box = new THREE.Box3();
    for (const e of this.entries.values()) box.expandByObject(e.object);
    if (box.isEmpty()) box.set(new THREE.Vector3(-20, -5, -20), new THREE.Vector3(20, 5, 20));
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 10);
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dir = new THREE.Vector3(0.45, 0.65, 0.6).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.orbit.target.copy(center);
    this.orbit.update();
    this.invalidate();
  }

  // ---------------------------------------------------------------- export

  collectExport(): ExportGroup[] {
    const groups: ExportGroup[] = [];
    const project = this.project;
    for (const [id, entry] of this.entries) {
      const name = project?.schematic.instances[id]?.ref ?? (project ? layoutWireLabel(project, id) : id);
      groups.push({ name, meshes: meshesOf(entry.object) });
    }
    this.airwires.forEach((w, i) => {
      groups.push({ name: `AIRWIRE_${w.net}_${i + 1}`, meshes: meshesOf(this.airwireGroup.children[i]!) });
    });
    return groups;
  }
}

function axes(): THREE.Group {
  const g = new THREE.Group();
  const mk = (dir: THREE.Vector3, color: number) => new THREE.ArrowHelper(dir, new THREE.Vector3(), 10, color, 2, 1);
  g.add(mk(new THREE.Vector3(1, 0, 0), 0xff3333), mk(new THREE.Vector3(0, 1, 0), 0x33dd33), mk(new THREE.Vector3(0, 0, 1), 0x3366ff));
  g.userData.pickable = false;
  return g;
}

function colorOf(m: THREE.Material): { color: [number, number, number]; opacity: number } {
  const c = 'color' in m && m.color instanceof THREE.Color ? m.color : new THREE.Color(0.8, 0.8, 0.8);
  return { color: [c.r, c.g, c.b], opacity: m.opacity };
}

function meshesOf(root: THREE.Object3D): ExportGroup['meshes'] {
  const result: ExportGroup['meshes'] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geom = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    const pos = geom.getAttribute('position');
    if (!pos) return;
    const index = geom.getIndex();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const ranges = geom.groups.length ? geom.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
    for (const r of ranges) {
      const mat = mats[r.materialIndex ?? 0] ?? mats[0]!;
      const count = Number.isFinite(r.count) ? r.count : (index ? index.count : pos.count) - r.start;
      if (index) {
        const idx = Array.from(index.array.slice(r.start, r.start + count));
        result.push({ positions: pos.array as ArrayLike<number>, indices: idx, material: colorOf(mat) });
      } else {
        const positions = (pos.array as Float32Array).slice(r.start * 3, (r.start + count) * 3);
        result.push({ positions, material: colorOf(mat) });
      }
    }
  });
  return result;
}
