"""One-off converters from Freeform-Planner v0.1.x to the 2.0 data formats.

    python tools/convert_legacy.py library [--out app/src/library/builtin.library.json]
        Builds the built-in library from footprints.py, componentLibrary.py and the bundled
        KiCad symbol library (symbol graphics are converted once; KiCad is not needed afterwards).

    python tools/convert_legacy.py project <in.ffps> <out.ffp-legacy.json>
        Converts a pickled v0.1.x project into the legacy JSON format (formatVersion 0), which
        the 2.0 app migrates on load. Needs panda3d (installed with ursina).

Coordinate frames
    Ursina:   left-handed, Y up. Its OBJ loader negates X of the file's vertices.
    2.0 app:  right-handed, Y up (Three.js).  ursina (x, y, z) -> (x, y, -z)
    So OBJ file -> app is (-x, y, -z): a 180 degree rotation about Y (no mirroring).
"""

import argparse
import ast
import json
import math
import pickle
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GRID_MM = 1.27  # schematic grid unit

# ----------------------------------------------------------------------------- helpers


def u2t(v):
    """Ursina point/vector -> app frame."""
    return [float(v[0]), float(v[1]), -float(v[2])]


def clean(x, nd=6):
    r = round(float(x), nd)
    return 0.0 if r == 0 else r


def quat_from_matrix(m):
    """Column-vector rotation matrix (3x3 nested lists) -> quaternion [x, y, z, w]."""
    t = m[0][0] + m[1][1] + m[2][2]
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        w, x, y, z = 0.25 * s, (m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s
    elif m[0][0] > m[1][1] and m[0][0] > m[2][2]:
        s = math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2
        w, x, y, z = (m[2][1] - m[1][2]) / s, 0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s
    elif m[1][1] > m[2][2]:
        s = math.sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2
        w, x, y, z = (m[0][2] - m[2][0]) / s, (m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s
    else:
        s = math.sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2
        w, x, y, z = (m[1][0] - m[0][1]) / s, (m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s
    if w < 0:  # canonical sign keeps output stable
        x, y, z, w = -x, -y, -z, -w
    return [clean(x), clean(y), clean(z), clean(w)]


def rotate(q, v):
    x, y, z, w = q
    tx = 2 * (y * v[2] - z * v[1])
    ty = 2 * (z * v[0] - x * v[2])
    tz = 2 * (x * v[1] - y * v[0])
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]


# ----------------------------------------------------------------------------- legacy python sources


def _vec3_args(node):
    return [ast.literal_eval(a) if not isinstance(a, ast.UnaryOp) else -ast.literal_eval(a.operand) for a in node.args]


# footprint corrections: DIODETHT reused the 0603 pin offsets although the model is 45 mm long
PIN_OVERRIDES = {"DIODETHT": [[22.5, 0, 0], [-22.5, 0, 0]]}


def parse_footprints(path):
    """Returns {class_name: {"model": str, "pins": [[x,y,z] ursina local]}}."""
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    result = {}
    for cls in tree.body:
        if not isinstance(cls, ast.ClassDef) or cls.name == "Footprint":
            continue
        model, pins = None, []
        for node in ast.walk(cls):
            if isinstance(node, ast.keyword) and node.arg == "model" and isinstance(node.value, ast.Constant):
                model = node.value.value
            if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "Vec3":
                pins.append(_vec3_args(node))
        if model:
            result[cls.name] = {"model": model, "pins": PIN_OVERRIDES.get(cls.name, pins)}
    return result


def parse_components(path):
    """Returns {class_name: [footprint class names]} for every Component subclass."""
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    result = {}
    for cls in tree.body:
        if not isinstance(cls, ast.ClassDef) or not any(getattr(b, "id", "") == "Component" for b in cls.bases):
            continue
        for node in ast.walk(cls):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "__init__":
                lists = [a for a in node.args if isinstance(a, ast.List)]
                if lists:
                    result[cls.name] = [e.id for e in lists[0].elts]
    return result


# ----------------------------------------------------------------------------- KiCad symbols


def parse_sexpr(text):
    tokens = re.findall(r'\(|\)|"(?:[^"\\]|\\.)*"|[^\s()]+', text)
    stack = [[]]
    for tok in tokens:
        if tok == "(":
            stack.append([])
        elif tok == ")":
            done = stack.pop()
            stack[-1].append(done)
        elif tok.startswith('"'):
            stack[-1].append(tok[1:-1])
        else:
            stack[-1].append(tok)
    return stack[0][0]


def find(node, key):
    return [c for c in node if isinstance(c, list) and c and c[0] == key]


def first(node, key):
    found = find(node, key)
    return found[0] if found else None


def g(x, y, dx=0.0):
    """KiCad mm (y up) -> grid units (y down)."""
    return [clean((float(x) + dx) / GRID_MM, 4), clean(-float(y) / GRID_MM, 4)]


DIRS = {0: "right", 90: "up", 180: "left", 270: "down"}

# multi-unit symbols are merged into one body; unit offsets in mm
UNIT_OFFSETS = {"TL072": {2: 20.32}}

# text anchor positions in grid units, tuned for readability
TEXT_POS = {
    "RES": ([2, -0.5], [2, 1]),
    "CAP": ([2, -0.5], [2, 1]),
    "PORT": ([0, -3.5], [0, -2.2]),
}


def fill_of(node):
    f = first(node, "fill")
    t = first(f, "type") if f else None
    return bool(t and t[1] in ("outline", "background"))


def convert_symbol(sym):
    name = sym[1]
    props = {p[1]: p for p in find(sym, "property")}
    graphics, pins = [], []
    for unit in find(sym, "symbol"):
        m = re.match(r".*_(\d+)_(\d+)$", unit[1])
        dx = UNIT_OFFSETS.get(name, {}).get(int(m.group(1)), 0.0) if m else 0.0
        for el in unit[2:]:
            if not isinstance(el, list):
                continue
            kind = el[0]
            if kind == "polyline":
                pts = [g(p[1], p[2], dx) for p in find(first(el, "pts"), "xy")]
                graphics.append({"kind": "line", "points": pts, "fill": fill_of(el)})
            elif kind == "rectangle":
                s, e = first(el, "start"), first(el, "end")
                graphics.append({"kind": "rect", "from": g(s[1], s[2], dx), "to": g(e[1], e[2], dx), "fill": fill_of(el)})
            elif kind == "circle":
                c, r = first(el, "center"), first(el, "radius")
                graphics.append({"kind": "circle", "center": g(c[1], c[2], dx), "radius": clean(float(r[1]) / GRID_MM, 4), "fill": fill_of(el)})
            elif kind == "pin":
                at = first(el, "at")
                length = first(el, "length")
                pins.append({
                    "number": first(el, "number")[1],
                    "name": first(el, "name")[1].replace("~", ""),
                    "at": g(at[1], at[2], dx),
                    "dir": DIRS[int(float(at[3])) % 360],
                    "length": clean(float(length[1]) / GRID_MM, 4),
                })
            elif kind in ("arc", "bezier", "text"):
                raise ValueError(f"{name}: unsupported graphic '{kind}'")
    pins.sort(key=lambda p: int(p["number"]) if p["number"].isdigit() else p["number"])
    ref_prop, val_prop = props["Reference"], props["Value"]
    ref_at, val_at = TEXT_POS.get(name, (None, None))
    if ref_at is None:
        ra, va = first(ref_prop, "at"), first(val_prop, "at")
        ref_at, val_at = g(ra[1], ra[2]), g(va[1], va[2])
    return {
        "id": name,
        "name": name,
        "refPrefix": ref_prop[2],
        "graphics": graphics,
        "pins": pins,
        "refAt": ref_at,
        "valueAt": val_at,
        "showPinNumbers": first(sym, "pin_numbers") is None,
        "showPinNames": not any(p["name"] in ("", "1") for p in pins) and len(pins) > 3,
        "power": False,
    }, props.get("Description", [None, None, ""])[2]


def power_symbols():
    def sym(name, graphics, value_at, direction):
        return {
            "id": name, "name": name, "refPrefix": "#PWR", "graphics": graphics,
            "pins": [{"number": "1", "name": name, "at": [0, 0], "dir": direction, "length": 0}],
            "refAt": [0, 0], "valueAt": value_at, "showPinNumbers": False, "showPinNames": False, "power": True,
        }
    gnd = sym("GND", [
        {"kind": "line", "points": [[0, 0], [0, 1]], "fill": False},
        {"kind": "line", "points": [[-1, 1], [1, 1], [0, 2], [-1, 1]], "fill": False},
    ], [0, 3.2], "down")
    rails = [sym(n, [
        {"kind": "line", "points": [[0, 0], [0, -1]], "fill": False},
        {"kind": "line", "points": [[-1, -1], [1, -1]], "fill": False},
    ], [0, -2], "up") for n in ("VCC", "+5V", "+3V3", "+12V")]
    return [gnd] + rails


# ----------------------------------------------------------------------------- library


SYMBOL_FOR_PART = {"DIODE": "DIODETHT"}
DEFAULT_VALUES = {"RES": "10k", "CAP": "100n", "LED5MM": "LED", "DIODE": "1N4148", "PORT": "PORT"}


def build_library():
    footprints = parse_footprints(ROOT / "footprints.py")
    components = parse_components(ROOT / "componentLibrary.py")
    kicad = parse_sexpr((ROOT / "KiCAD_Library" / "Freeform-Planner-Library.kicad_sym").read_text(encoding="utf-8"))

    lib = {"formatVersion": 1, "kind": "freeform-planner-library", "name": "Built-in", "symbols": {}, "footprints": {}, "parts": {}}
    descriptions = {}
    for s in find(kicad, "symbol"):
        sym, desc = convert_symbol(s)
        lib["symbols"][sym["id"]] = sym
        descriptions[sym["id"]] = desc
    for sym in power_symbols():
        lib["symbols"][sym["id"]] = sym
        lib["parts"][sym["id"]] = {
            "id": sym["id"], "name": sym["id"], "description": "Power symbol", "symbolId": sym["id"],
            "defaultValue": sym["id"], "variants": [],
        }

    for cls, fp in footprints.items():
        model_path = ("models/WIRE/" if cls.startswith("WIRE") else "models/") + fp["model"]
        lib["footprints"][cls] = {
            "id": cls,
            "name": cls.replace("_", " "),
            "model": {"kind": "asset", "path": model_path},
            "modelRotation": [0, 1, 0, 0],
            "modelOffset": [0, 0, 0],
            "modelScale": 1,
            "pins": [{"number": str(i + 1), "position": [clean(c) for c in u2t(p)]} for i, p in enumerate(fp["pins"])],
            "isWire": cls.startswith("WIRE"),
        }

    for cls, fps in components.items():
        if cls == "WIRE":
            continue  # freeform wires are layout objects, not parts
        symbol_id = SYMBOL_FOR_PART.get(cls, cls)
        sym = lib["symbols"][symbol_id]
        variants = []
        for fp in fps:
            fp_pins = {p["number"] for p in lib["footprints"][fp]["pins"]}
            # v0.1.x used the same pin numbers for every footprint of a part
            pin_map = {p["number"]: p["number"] for p in sym["pins"] if p["number"] in fp_pins}
            variants.append({"footprintId": fp, "pinMap": pin_map})
        lib["parts"][cls] = {
            "id": cls, "name": cls, "description": descriptions.get(symbol_id, ""), "symbolId": symbol_id,
            "defaultValue": DEFAULT_VALUES.get(cls, cls), "variants": variants,
        }
    return lib


# ----------------------------------------------------------------------------- project


class _LegacyUnpickler(pickle.Unpickler):
    """Reads .ffps pickles without importing ursina: Vec3 becomes a plain tuple."""

    def find_class(self, module, name):
        if name in ("Vec3", "Vec2", "Vec4", "LVecBase3f", "LPoint3f", "LVector3f"):
            return lambda *a: tuple(float(x) for x in a)
        return super().find_class(module, name)


def ursina_matrix(rotation):
    """Rotation matrix (column-vector form, ursina frame) of an ursina entity rotation."""
    from panda3d.core import NodePath, loadPrcFileData

    loadPrcFileData("", "coordinate-system y-up-left")  # same as ursina/window.py
    np_ = NodePath("e")
    rx, ry, rz = rotation
    np_.setHpr(ry * -1, rx * -1, rz)  # ursina: setHpr(Vec3(r[1], r[0], r[2]) * (-1, -1, 1))
    m = np_.getMat()
    # panda uses row vectors: row i is the image of basis vector i -> transpose
    return [[m.getCell(c, r) for c in range(3)] for r in range(3)], np_


def convert_project(path, footprints, components):
    with open(path, "rb") as fh:
        data = _LegacyUnpickler(fh).load()
    out = {"formatVersion": 0, "kind": "freeform-planner-legacy", "components": {}, "nets": {}}
    max_err = 0.0
    for designator, c in data["components"].items():
        if c["value"] in (None, "None"):
            continue
        m_u, node = ursina_matrix(c["rotation"])
        s = [[1, 0, 0], [0, 1, 0], [0, 0, -1]]
        m_t = [[sum(s[i][k] * m_u[k][l] * s[l][j] for k in range(3) for l in range(3)) for j in range(3)] for i in range(3)]
        q = quat_from_matrix(m_t)
        pos = [clean(v) for v in u2t(c["position"])]
        fp_list = components.get(c["value"], [])
        fp_cls = fp_list[int(c["footprint"])] if int(c["footprint"]) < len(fp_list) else None
        out["components"][designator] = {"value": c["value"], "footprint": int(c["footprint"]), "footprintId": fp_cls, "position": pos, "rotation": q}

        # self-check: pin world positions must match what ursina computed
        if fp_cls in footprints:
            from panda3d.core import NodePath

            node.setPos(*c["position"])
            for local in footprints[fp_cls]["pins"]:
                child = NodePath("pin")
                child.reparentTo(node)
                child.setPos(*local)
                expected = u2t(child.getNetTransform().getPos())
                got = [a + b for a, b in zip(pos, rotate(q, u2t(local)))]
                max_err = max(max_err, max(abs(a - b) for a, b in zip(expected, got)))
    for net, members in data["nets"].items():
        out["nets"][net] = {k: (v if isinstance(v, int) else str(v)) for k, v in members.items()}
    if max_err > 1e-3:
        raise SystemExit(f"coordinate conversion self-check failed, max pin error {max_err}")
    print(f"converted {len(out['components'])} components, pin self-check max error {max_err:.2e}", file=sys.stderr)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    lib_p = sub.add_parser("library")
    lib_p.add_argument("--out", default=str(ROOT / "app" / "src" / "library" / "builtin.library.json"))
    prj_p = sub.add_parser("project")
    prj_p.add_argument("input")
    prj_p.add_argument("output")
    args = ap.parse_args()

    if args.cmd == "library":
        lib = build_library()
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(lib, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {len(lib['symbols'])} symbols, {len(lib['footprints'])} footprints, {len(lib['parts'])} parts to {args.out}")
    else:
        footprints = parse_footprints(ROOT / "footprints.py")
        components = parse_components(ROOT / "componentLibrary.py")
        out = convert_project(args.input, footprints, components)
        Path(args.output).write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
