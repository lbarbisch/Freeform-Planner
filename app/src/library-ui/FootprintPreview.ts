/** Small Three.js viewer for the footprint editor: shows the model in footprint space with
 * numbered pin markers and reports clicked surface points. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FootprintDef, Vec3 } from '../core';
import { applyModelTransform, cloneWithMaterials, loadModel } from '../layout3d/models';

export class FootprintPreview {
  private renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
  private controls: OrbitControls;
  private modelRoot = new THREE.Group();
  private pinRoot = new THREE.Group();
  private disposed = false;
  private loadToken = 0;
  private lastModelKey = '';
  onPick: ((p: Vec3) => void) | null = null;

  constructor(private host: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x2b2f36);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(30, 60, 40);
    this.scene.add(sun, new THREE.AxesHelper(5), this.modelRoot, this.pinRoot);
    const grid = new THREE.GridHelper(100, 100, 0x555b66, 0x3a3f48);
    this.scene.add(grid);
    this.camera.position.set(25, 25, 35);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('change', () => this.render());

    let down: { x: number; y: number } | null = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) this.onPick?.(hit);
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
    this.pinRoot.clear();
    for (const pin of fp.pins) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff4040, depthTest: false }));
      marker.position.set(...pin.position);
      marker.renderOrder = 10;
      const label = textSprite(pin.number);
      label.position.set(0, 1.2, 0);
      marker.add(label);
      this.pinRoot.add(marker);
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

  private pick(clientX: number, clientY: number): Vec3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.modelRoot, true)[0];
    return hit ? (hit.point.toArray().map((v) => Math.round(v * 100) / 100) as Vec3) : null;
  }

  dispose(): void {
    this.disposed = true;
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
