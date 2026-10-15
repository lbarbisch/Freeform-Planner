/** 3Dconnexion SpaceMouse via WebHID (Chromium based browsers). Optional: without WebHID or a
 * device the app works the same. */
import * as THREE from 'three';
import { getState } from '../app/store';
import type { LayoutScene } from './LayoutScene';
import { cameraDeltas, decodeButtons, decodeReport, zeroAxes, type SpaceMouseAxes } from './spaceMouseMath';

const VENDORS = [0x256f, 0x046d]; // 3Dconnexion, Logitech (older devices)
const RESET_BUTTON_MASK = 0b10; // right button

interface HIDDeviceLike {
  opened: boolean;
  vendorId: number;
  productName: string;
  open(): Promise<void>;
  close(): Promise<void>;
  addEventListener(type: 'inputreport', cb: (e: { reportId: number; data: DataView }) => void): void;
}

interface HIDLike {
  getDevices(): Promise<HIDDeviceLike[]>;
  requestDevice(opts: { filters: { vendorId: number }[] }): Promise<HIDDeviceLike[]>;
}

const hid = (): HIDLike | undefined => (navigator as unknown as { hid?: HIDLike }).hid;

export class SpaceMouse {
  static get supported(): boolean {
    return !!hid();
  }

  onStatus: ((connected: boolean) => void) | null = null;
  private axes: SpaceMouseAxes = zeroAxes();
  private buttons = 0;
  private device: HIDDeviceLike | null = null;
  private raf = 0;
  private last = 0;
  private disposed = false;

  constructor(private scene: LayoutScene) {}

  /** Re-opens a device the user granted earlier, without prompting. */
  async reconnect(): Promise<void> {
    const h = hid();
    if (!h) return;
    try {
      const devices = await h.getDevices();
      const d = devices.find((x) => VENDORS.includes(x.vendorId));
      if (d) await this.attach(d);
    } catch {
      /* not available */
    }
  }

  /** Asks the user to pick a device (must be called from a click). */
  async request(): Promise<void> {
    const h = hid();
    if (!h) return;
    try {
      const [d] = await h.requestDevice({ filters: VENDORS.map((vendorId) => ({ vendorId })) });
      if (d) await this.attach(d);
    } catch {
      /* cancelled */
    }
  }

  private async attach(d: HIDDeviceLike): Promise<void> {
    if (this.disposed) return;
    if (!d.opened) await d.open();
    this.device = d;
    d.addEventListener('inputreport', (e) => {
      const axes = decodeReport(e.reportId, e.data, this.axes);
      if (axes) this.axes = axes;
      const buttons = decodeButtons(e.reportId, e.data);
      if (buttons !== null) {
        if (buttons & RESET_BUTTON_MASK && !(this.buttons & RESET_BUTTON_MASK)) this.scene.frameAll();
        this.buttons = buttons;
      }
    });
    this.onStatus?.(true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const settings = getState().settings.spaceMouse;
    if (settings.enabled) this.applyToCamera(cameraDeltas(this.axes, dt, settings));
    this.raf = requestAnimationFrame(this.tick);
  };

  private applyToCamera(d: ReturnType<typeof cameraDeltas>): void {
    if (!d.panRight && !d.panUp && !d.zoom && !d.orbitUp && !d.orbitRight) return;
    const { camera, orbit } = this.scene;
    const offset = camera.position.clone().sub(orbit.target);
    const distance = offset.length();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const pan = right.multiplyScalar(d.panRight * distance).add(up.multiplyScalar(d.panUp * distance));
    orbit.target.add(pan);
    // orbit around the target
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += THREE.MathUtils.degToRad(d.orbitRight);
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + THREE.MathUtils.degToRad(d.orbitUp), 0.01, Math.PI - 0.01);
    spherical.radius = Math.max(1, spherical.radius * (1 - d.zoom));
    camera.position.copy(orbit.target).add(new THREE.Vector3().setFromSpherical(spherical));
    orbit.update();
    this.scene.invalidate();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    void this.device?.close().catch(() => undefined);
  }
}
