/** Small Three.js viewer for the footprint editor: shows the model in footprint space with
 * numbered pin markers, reports clicked surface points and lets the user select a pin and
 * drag it with a move gizmo. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { FootprintDef, Vec3 } from '../core';
import { applyModelTransform, cloneWithMaterials, loadModel } from '../layout3d/models';

const PIN_COLOR = 0xff4040;
const PIN_SELECTED_COLOR = 0x33ff66;

const round2 = (v: number) => Math.round(v * 100) / 100 + 0;

export class FootprintPreview {
  private renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
  private controls: OrbitControls;
  private gizmo: TransformControls;
  /** the gizmo moves this proxy; the pin follows through onPinMove */
  private gizmoTarget = new THREE.Object3D();
  private modelRoot = new THREE.Group();
  private pinRoot = new THREE.Group();
  private pinGeometry = new THREE.SphereGeometry(0.35, 12, 8);
  private pinMaterial = new THREE.MeshBasicMaterial({ color: PIN_COLOR, depthTest: false });
  private pinSelectedMaterial = new THREE.MeshBasicMaterial({ color: PIN_SELECTED_COLOR, depthTest: false });
  private disposed = false;
  private loadToken = 0;
  private lastModelKey = '';
  private pins: Vec3[] = [];
  private selectedPin: number | null = null;
  /** clicked on the model surface (not on a pin) */
  onPick: ((p: Vec3) => void) | null = null;
  /** clicked on a pin marker, or on empty space (null) */
  onSelectPin: ((index: number | null) => void) | null = null;
  /** live pin position while the gizmo is dragged */
  onPinMove: ((index: number, position: Vec3) => void) | null = null;
  onPinMoveEnd: (() => void) | null = null;

  constructor(private host: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x2b2f36);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(30, 60, 40);
    this.scene.add(sun, new THREE.AxesHelper(5), this.modelRoot, this.pinRoot, this.gizmoTarget);
    const grid = new THREE.GridHelper(100, 100, 0x555b66, 0x3a3f48);
    this.scene.add(grid);
    this.camera.position.set(25, 25, 35);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('change', () => this.render());

    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSize(0.7);
    this.gizmo.setMode('translate');
    this.gizmo.addEventListener('change', () => this.render());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
      if (!e.value) this.onPinMoveEnd?.();
    });
    this.gizmo.addEventListener('objectChange', () => {
      if (this.selectedPin === null) return;
      const p = this.gizmoTarget.position;
      this.onPinMove?.(this.selectedPin, [round2(p.x), round2(p.y), round2(p.z)]);
    });
    this.scene.add(this.gizmo.getHelper());

    let down: { x: number; y: number } | null = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null));
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      // the gizmo consumes clicks on its handles
      if (this.gizmo.dragging || this.gizmo.axis !== null) return;
      const pin = this.pickPin(e.clientX, e.clientY);
      if (pin !== null) return this.onSelectPin?.(pin);
      const hit = this.pick(e.clientX, e.clientY);
      if (hit && this.onPick) this.onPick(hit);
      else this.onSelectPin?.(null);
    });
    this.resize();
  }

  resize(): void {
    const w = Math.max(this.host.clientWidth, 1);
    const h = Math.max(this.host.clientHeight, 1);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render(): void {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  show(fp: FootprintDef): void {
    const modelKey = JSON.stringify([fp.model, fp.modelRotation, fp.modelOffset, fp.modelScale]);
    if (modelKey !== this.lastModelKey) {
      const firstLoad = this.lastModelKey === '';
      this.lastModelKey = modelKey;
      const token = ++this.loadToken;
      void loadModel(fp.model).then((template) => {
        if (token !== this.loadToken || this.disposed) return;
        this.modelRoot.clear();
        const model = cloneWithMaterials(template);
        applyModelTransform(model, fp);
        this.modelRoot.add(model);
        if (firstLoad) this.frame();
        this.render();
      });
    }
    this.pins = fp.pins.map((p) => p.position);
    for (const old of this.pinRoot.children) {
      const sprite = old.children[0] as THREE.Sprite | undefined;
      sprite?.material.map?.dispose();
      sprite?.material.dispose();
    }
    this.pinRoot.clear();
    fp.pins.forEach((pin, i) => {
      const marker = new THREE.Mesh(this.pinGeometry, this.pinMaterial);
      marker.position.set(...pin.position);
      marker.renderOrder = 10;
      marker.userData.pinIndex = i;
      const label = textSprite(pin.number);
      label.position.set(0, 1.2, 0);
      marker.add(label);
      this.pinRoot.add(marker);
    });
    this.syncSelection();
  }

  /** Highlights a pin and puts the move gizmo on it (null hides the gizmo). */
  setSelectedPin(index: number | null): void {
    this.selectedPin = index;
    this.syncSelection();
  }

  private syncSelection(): void {
    const index = this.selectedPin !== null && this.selectedPin < this.pins.length ? this.selectedPin : null;
    this.pinRoot.children.forEach((m, i) => {
      const mesh = m as THREE.Mesh;
      mesh.material = i === index ? this.pinSelectedMaterial : this.pinMaterial;
      mesh.scale.setScalar(i === index ? 1.4 : 1);
    });
    if (index === null) {
      this.gizmo.detach();
    } else {
      // while dragging the gizmo leads and the pin follows it
      if (!this.gizmo.dragging) this.gizmoTarget.position.set(...this.pins[index]!);
      if (this.gizmo.object !== this.gizmoTarget) this.gizmo.attach(this.gizmoTarget);
    }
    this.render();
  }

  frame(): void {
    const box = new THREE.Box3().expandByObject(this.modelRoot);
    for (const c of this.pinRoot.children) box.expandByPoint(c.position);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 3);
    this.camera.position.copy(center).add(new THREE.Vector3(0.5, 0.6, 0.8).normalize().multiplyScalar(radius * 2.8));
    this.controls.target.copy(center);
    this.controls.update();
    this.render();
  }

  private raycaster(clientX: number, clientY: number): THREE.Raycaster {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray;
  }

  /** Pin markers are drawn on top, so they win over the model behind them. */
  private pickPin(clientX: number, clientY: number): number | null {
    for (const hit of this.raycaster(clientX, clientY).intersectObject(this.pinRoot, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.pinIndex === undefined) o = o.parent;
      if (o) return o.userData.pinIndex as number;
    }
    return null;
  }

  private pick(clientX: number, clientY: number): Vec3 | null {
    const hit = this.raycaster(clientX, clientY).intersectObject(this.modelRoot, true)[0];
    return hit ? (hit.point.toArray().map(round2) as Vec3) : null;
  }

  dispose(): void {
    this.disposed = true;
    this.gizmo.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function textSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 34);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.setScalar(1.4);
  sprite.renderOrder = 11;
  return sprite;
}
