/** 3Dconnexion SpaceMouse via WebHID (Chromium based browsers). Optional: without WebHID or a
 * device the app works the same. */
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getState, setState, type AppState, type MenuAction } from '../app/store';
import { cameraDeltas, decodeButtons, decodeReport, isDeflected, zeroAxes, type SpaceMouseAxes } from './spaceMouseMath';

const VENDORS = [0x256f, 0x046d]; // 3Dconnexion, Logitech (older devices)
const RESET_BUTTON_MASK = 0b10; // right button
/** The 3Dconnexion driver's legacy mode turns cap motion into synthetic wheel events for apps it
 * doesn't know (the browser). Wheel events this soon after cap motion are dropped. */
const WHEEL_SUPPRESS_MS = 300;

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

/** What the SpaceMouse steers: a camera orbiting a target (3D layout, footprint editor). */
export interface SpaceMouseView {
  readonly camera: THREE.PerspectiveCamera;
  readonly orbit: OrbitControls;
  invalidate(): void;
  frameAll(): void;
}

/** Steers a view with the SpaceMouse while it is shown and publishes the connection state for
 * the View menu and the settings dialog. Returns the cleanup. */
export function attachSpaceMouse(view: SpaceMouseView): () => void {
  const sm = new SpaceMouse(view);
  const connect = () => void sm.request();
  if (SpaceMouse.supported) setState({ spaceMouse: { connected: false, connect } });
  sm.onStatus = (connected) => setState({ spaceMouse: { connected, connect } });
  void sm.reconnect();
  return () => {
    sm.dispose();
    setState({ spaceMouse: null });
  };
}

/** View menu entry: connect, or a checked entry once connected. */
export function spaceMouseMenu(state: AppState['spaceMouse']): MenuAction[] {
  return state ? [{ label: state.connected ? 'SpaceMouse connected' : 'Connect SpaceMouse…', active: state.connected, run: state.connect }] : [];
}

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
  private lastDeflected = -Infinity;
  /** the tab is focused and visible; otherwise the device is released and the wheel left alone */
  private active = isActiveTab();
  private wheelGuard = false;

  constructor(private scene: SpaceMouseView) {
    window.addEventListener('focus', this.onFocusChange);
    window.addEventListener('blur', this.onFocusChange);
    document.addEventListener('visibilitychange', this.onFocusChange);
  }

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
    if (this.disposed || this.device === d) return;
    if (this.active && !d.opened) await d.open();
    this.device = d;
    d.addEventListener('inputreport', (e) => {
      // the device outlives this controller when the view is closed and opened again
      if (!this.active || this.disposed) return;
      const axes = decodeReport(e.reportId, e.data, this.axes);
      if (axes) {
        this.axes = axes;
        if (isDeflected(axes)) this.lastDeflected = performance.now();
      }
      const buttons = decodeButtons(e.reportId, e.data);
      if (buttons !== null) {
        if (buttons & RESET_BUTTON_MASK && !(this.buttons & RESET_BUTTON_MASK)) this.scene.frameAll();
        this.buttons = buttons;
      }
    });
    this.setWheelGuard(this.active);
    this.onStatus?.(true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Releases the device while another tab or app has the focus, so the driver can serve it,
   * and takes it back when the tab is focused again. */
  private onFocusChange = () => {
    const active = isActiveTab();
    if (active === this.active || this.disposed) return;
    this.active = active;
    const d = this.device;
    if (!active) {
      this.axes = zeroAxes();
      this.lastDeflected = -Infinity;
      this.setWheelGuard(false);
      if (d?.opened) void d.close().catch(() => undefined);
    } else if (d) {
      this.setWheelGuard(true);
      if (!d.opened) void d.open().catch(() => undefined);
    }
  };

  private setWheelGuard(on: boolean): void {
    if (on === this.wheelGuard) return;
    this.wheelGuard = on;
    if (on) window.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    else window.removeEventListener('wheel', this.onWheel, { capture: true });
  }

  private onWheel = (e: WheelEvent) => {
    if (!getState().settings.spaceMouse.enabled) return;
    if (isDeflected(this.axes) || performance.now() - this.lastDeflected < WHEEL_SUPPRESS_MS) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  private tick = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const settings = getState().settings.spaceMouse;
    if (settings.enabled && this.active) this.applyToCamera(cameraDeltas(this.axes, dt, settings));
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
    this.setWheelGuard(false);
    window.removeEventListener('focus', this.onFocusChange);
    window.removeEventListener('blur', this.onFocusChange);
    document.removeEventListener('visibilitychange', this.onFocusChange);
    void this.device?.close().catch(() => undefined);
  }
}

function isActiveTab(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}
