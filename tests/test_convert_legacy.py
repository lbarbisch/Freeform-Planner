"""The 2.0 built-in library and golden fixtures are generated from the v0.1.x sources by
tools/convert_legacy.py. These tests make sure the committed files stay reproducible."""

import json
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import convert_legacy as cl  # noqa: E402


def test_builtin_library_is_reproducible():
    committed = json.loads((ROOT / "app" / "src" / "library" / "builtin.library.json").read_text(encoding="utf-8"))
    assert cl.build_library() == committed


def test_example_project_conversion_is_reproducible():
    pytest.importorskip("panda3d")
    footprints = cl.parse_footprints(ROOT / "footprints.py")
    components = cl.parse_components(ROOT / "componentLibrary.py")
    converted = cl.convert_project(ROOT / "KiCAD_Example_Project" / "Transistor_Blinker.ffps", footprints, components)
    committed = json.loads((ROOT / "app" / "fixtures" / "v0.1.1-transistor-blinker.legacy.json").read_text(encoding="utf-8"))
    assert converted == committed


def test_frame_conversion_flips_z():
    assert cl.u2t((1, 2, 3)) == [1.0, 2.0, -3.0]


@pytest.mark.parametrize(
    "matrix, quat",
    [
        ([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, 0, 1]),
        # 90 degrees about +Y (right-handed): x -> -z
        ([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [0, math.sqrt(0.5), 0, math.sqrt(0.5)]),
        # 180 degrees about +X
        ([[1, 0, 0], [0, -1, 0], [0, 0, -1]], [1, 0, 0, 0]),
    ],
)
def test_quat_from_matrix(matrix, quat):
    assert cl.quat_from_matrix(matrix) == pytest.approx(quat, abs=1e-6)


def test_quaternion_rotation_matches_matrix():
    q = cl.quat_from_matrix([[0, 0, 1], [0, 1, 0], [-1, 0, 0]])
    assert cl.rotate(q, [1, 0, 0]) == pytest.approx([0, 0, -1], abs=1e-6)


def test_footprint_parsing_reads_models_and_pins():
    fps = cl.parse_footprints(ROOT / "footprints.py")
    assert fps["TO92"]["model"] == "TO92"
    assert fps["TO92"]["pins"] == [[2.4, -12, 0], [0, -12, 0], [-2.4, -12, 0]]
    assert len(fps["SOIC8"]["pins"]) == 8
    # the diode pin offsets were wrong in v0.1.x and are corrected
    assert fps["DIODETHT"]["pins"] == [[22.5, 0, 0], [-22.5, 0, 0]]


def test_component_parsing_lists_footprint_variants():
    comps = cl.parse_components(ROOT / "componentLibrary.py")
    assert comps["RES"] == ["RESTHT", "RESTHT_SHORT", "RES0603"]
    assert comps["WIRE"] == ["WIRE10X10", "WIRE20X10", "WIRE20X50", "WIRE50X20"]
