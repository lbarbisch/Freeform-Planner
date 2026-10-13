"""Tests for spaceMouse module - SpaceMouse axis to camera mapping"""

import pytest
from unittest.mock import MagicMock, Mock, patch

import spaceMouse
from spaceMouse import SpaceMouse, apply_deadzone, camera_deltas


class TestApplyDeadzone:
    def test_inside_deadzone_is_zero(self):
        assert apply_deadzone(0.03, deadzone=0.05) == 0.0
        assert apply_deadzone(-0.05, deadzone=0.05) == 0.0

    def test_full_deflection_stays_full(self):
        assert apply_deadzone(1.0, deadzone=0.05) == pytest.approx(1.0)
        assert apply_deadzone(-1.0, deadzone=0.05) == pytest.approx(-1.0)

    def test_rescales_from_deadzone_edge(self):
        assert apply_deadzone(0.5, deadzone=0.5) == 0.0
        assert apply_deadzone(0.75, deadzone=0.5) == pytest.approx(0.5)
        assert apply_deadzone(-0.75, deadzone=0.5) == pytest.approx(-0.5)


class TestCameraDeltas:
    def test_at_rest_no_motion(self):
        assert camera_deltas((0, 0, 0, 0, 0, 0), dt=1) == (0, 0, 0, 0, 0)

    def test_scales_with_dt(self):
        full = camera_deltas((1, 1, 1, 1, 1, 0), dt=1)
        half = camera_deltas((1, 1, 1, 1, 1, 0), dt=0.5)
        assert half == pytest.approx(tuple(v / 2 for v in full))

    def test_object_mode_directions(self):
        """the scene follows the cap, so the camera moves the opposite way"""
        pan_right, pan_up, zoom, rotate_x, rotate_y = camera_deltas((1, 1, 1, 1, 1, 0), dt=1)
        assert pan_right < 0
        assert pan_up < 0
        assert zoom < 0         # pushing forward moves the scene away
        assert rotate_x < 0
        assert rotate_y < 0

    def test_view_roll_is_ignored(self):
        assert camera_deltas((0, 0, 0, 0, 0, 1), dt=1) == (0, 0, 0, 0, 0)


class TestSpaceMouseStart:
    def _editor_camera(self):
        ec = Mock()
        ec.position = (0, 0, 0)
        ec.rotation = (0, 0, 0)
        ec.target_z = -200
        return ec

    def test_missing_library_does_not_raise(self):
        sm = SpaceMouse(self._editor_camera())
        with patch.dict('sys.modules', {'pyspacemouse': None}):
            assert sm.start() is False
        assert not sm.connected

    def test_no_device_does_not_raise(self):
        sm = SpaceMouse(self._editor_camera())
        fake = Mock()
        fake.open.side_effect = RuntimeError("No connected or supported devices found.")
        with patch.dict('sys.modules', {'pyspacemouse': fake}):
            assert sm.start() is False
        assert not sm.connected

    def test_disabled_in_settings(self):
        sm = SpaceMouse(self._editor_camera())
        with patch.object(spaceMouse, 'spacemouse_enabled', False):
            assert sm.start() is False

    def test_update_without_device_leaves_camera_alone(self):
        ec = self._editor_camera()
        sm = SpaceMouse(ec)
        sm.update()
        assert ec.target_z == -200


class TestScrollFilter:
    """the 3Dconnexion driver emits mouse wheel events for unsupported apps, these must not zoom twice"""

    def _space_mouse(self):
        ec = Mock()
        ec.position = MagicMock()
        ec.rotation = (0, 0, 0)
        ec.rotation_x = 0
        ec.rotation_y = 0
        ec.target_z = -200
        camera_input = ec.input
        sm = SpaceMouse(ec)
        sm._running = True
        return sm, ec, camera_input

    def test_scroll_passes_when_space_mouse_idle(self):
        sm, ec, camera_input = self._space_mouse()
        ec.input('scroll up')
        camera_input.assert_called_once_with('scroll up')

    def test_scroll_dropped_while_space_mouse_moves(self):
        sm, ec, camera_input = self._space_mouse()
        sm.axes = (0, 0, 0, 0.5, 0, 0)
        with patch.object(spaceMouse, 'camera'), patch.object(spaceMouse, 'time', Mock(dt=0.016)):
            sm.update()
        ec.input('scroll up')
        ec.input('scroll down')
        camera_input.assert_not_called()

    def test_other_keys_pass_while_space_mouse_moves(self):
        sm, ec, camera_input = self._space_mouse()
        sm.axes = (0, 0, 0, 0.5, 0, 0)
        with patch.object(spaceMouse, 'camera'), patch.object(spaceMouse, 'time', Mock(dt=0.016)):
            sm.update()
        ec.input('right mouse down')
        camera_input.assert_called_once_with('right mouse down')

    def test_scroll_passes_again_after_block_time(self):
        sm, ec, camera_input = self._space_mouse()
        sm._last_motion = spaceMouse.perf_counter() - spaceMouse.spacemouse_scroll_block_time - 1
        ec.input('scroll up')
        camera_input.assert_called_once_with('scroll up')
