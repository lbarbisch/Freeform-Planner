"""3Dconnexion SpaceMouse support for camera navigation (via pyspacemouse)"""

import threading
from time import perf_counter
from ursina import Vec3, camera, time
from settings import *


def apply_deadzone(value, deadzone=spacemouse_deadzone):
    """zero out small values and rescale the rest so motion starts smoothly at the deadzone edge"""
    if abs(value) <= deadzone:
        return 0.0
    sign = 1 if value > 0 else -1
    return sign * (abs(value) - deadzone) / (1 - deadzone)


def camera_deltas(axes, dt):
    """convert SpaceMouse axes into camera movement for one frame

    axes are (x, y, z, roll, pitch, yaw) in the UNITY convention (same as ursina:
    x right, y up, z forward, left handed). The mapping follows 3Dconnexion's
    "object mode": the scene moves the way the cap is pushed / twisted.

    returns (pan_right, pan_up, zoom, rotate_x, rotate_y)
    pan_* and zoom are fractions of the camera distance, rotate_* are degrees
    """
    x, y, z, roll, pitch, yaw = (apply_deadzone(a) for a in axes)
    pan_right = -x * spacemouse_pan_speed * dt
    pan_up    = -y * spacemouse_pan_speed * dt
    zoom      = -z * spacemouse_zoom_speed * dt
    rotate_x  = -roll  * spacemouse_rotation_speed * dt
    rotate_y  = -pitch * spacemouse_rotation_speed * dt
    return pan_right, pan_up, zoom, rotate_x, rotate_y


class SpaceMouse():
    """reads a SpaceMouse in a background thread and moves an EditorCamera with it"""

    def __init__(self, editor_camera):
        self.editor_camera = editor_camera
        self.start_position = Vec3(editor_camera.position)
        self.start_rotation = Vec3(editor_camera.rotation)
        self.start_target_z = editor_camera.target_z
        self.device = None
        self.axes = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        self.buttons = []
        self._previous_buttons = []
        self._running = False
        self._last_motion = None

        # the 3Dconnexion driver turns cap tilt into mouse wheel events for applications it does not know,
        # which would add a steppy scroll zoom on top of the smooth SpaceMouse zoom, so drop those
        self._camera_input = editor_camera.input
        editor_camera.input = self._filter_camera_input

    @property
    def connected(self):
        return self.device is not None

    def start(self):
        """try to open the first connected SpaceMouse; returns False (and the app works without it) on any failure"""
        if not spacemouse_enabled:
            return False
        try:
            # imported here, because easyhid raises on import if the hidapi library is missing
            import pyspacemouse
        except Exception as e:
            print("SpaceMouse not available: could not load pyspacemouse / hidapi library (" + str(e) + ")")
            return False
        try:
            # blocking reads in our own thread, so reports never queue up and lag behind
            self.device = pyspacemouse.open(nonblocking=False,
                                            axis_convention=pyspacemouse.AxisConvention.UNITY)
        except Exception as e:
            print("SpaceMouse not available:", e)
            self.device = None
            return False

        self._running = True
        threading.Thread(target=self._read_loop, name="SpaceMouseReader", daemon=True).start()
        return True

    def stop(self):
        """stop processing input; the daemon reader thread ends with the application"""
        # the device is not closed here, closing a handle while the reader thread is blocked in hid_read is unsafe
        self._running = False

    def _read_loop(self):
        while self._running:
            try:
                state = self.device.read()
            except Exception as e:
                print("SpaceMouse disconnected:", e)
                self.axes = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
                self.device = None
                self._running = False
                return
            self.axes = (state.x, state.y, state.z, state.roll, state.pitch, state.yaw)
            self.buttons = list(state.buttons)

    def is_moving(self):
        """True while the cap is deflected and shortly after it was released"""
        if self._last_motion is None:
            return False
        return perf_counter() - self._last_motion < spacemouse_scroll_block_time

    def _filter_camera_input(self, key):
        if key in ('scroll up', 'scroll down') and self._running and self.is_moving():
            return
        return self._camera_input(key)

    def _button_pressed(self, index):
        """True only on the frame the button goes down"""
        now = len(self.buttons) > index and self.buttons[index]
        before = len(self._previous_buttons) > index and self._previous_buttons[index]
        return now and not before

    def reset_view(self):
        ec = self.editor_camera
        ec.position = self.start_position
        ec.rotation = self.start_rotation
        ec.target_z = self.start_target_z

    def update(self):
        """apply the current SpaceMouse state to the camera, call once per frame"""
        if not self._running:
            return

        if self._button_pressed(spacemouse_button_reset_view):
            self.reset_view()
        self._previous_buttons = self.buttons

        if any(abs(a) > spacemouse_motion_threshold for a in self.axes):
            self._last_motion = perf_counter()

        pan_right, pan_up, zoom, rotate_x, rotate_y = camera_deltas(self.axes, time.dt)
        ec = self.editor_camera
        distance = abs(ec.target_z)

        # pan relative to the view, scaled with the camera distance like the middle mouse pan
        ec.position += (camera.right * pan_right + camera.up * pan_up) * distance
        # zoom proportional to the distance, never moving through the pivot point
        ec.target_z = min(ec.target_z + zoom * distance, -spacemouse_min_distance)
        # orbit around the pivot (EditorCamera mirrors these to its smoothing helper)
        ec.rotation_x += rotate_x
        ec.rotation_y += rotate_y
