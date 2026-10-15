"""Computes the airwires v0.1.1 draws for a .ffps project, using the original updateAirwires
logic (helperFunctions._kruskal_mst) and pin positions computed the same way ursina does.

    python tools/legacy_airwire_golden.py <in.ffps> <out.json>

The output (endpoints in the app's right-handed frame) is the parity reference for the 2.0
airwire implementation; see app/src/core/legacy.test.ts.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import convert_legacy as cl  # noqa: E402
from helperFunctions import _kruskal_mst  # noqa: E402


def main(src, dst):
    from panda3d.core import NodePath

    footprints = cl.parse_footprints(cl.ROOT / "footprints.py")
    components = cl.parse_components(cl.ROOT / "componentLibrary.py")
    with open(src, "rb") as fh:
        data = cl._LegacyUnpickler(fh).load()

    def pin_pos(designator, pin):
        c = data["components"][designator]
        fp_cls = components[c["value"]][int(c["footprint"])]
        _, node = cl.ursina_matrix(c["rotation"])
        node.setPos(*c["position"])
        child = NodePath("pin")
        child.reparentTo(node)
        child.setPos(*footprints[fp_cls]["pins"][pin - 1])
        p = child.getNetTransform().getPos()
        return (p[0], p[1], p[2])

    result = {}
    for net, members in data["nets"].items():
        if "unconnected" in net:
            continue
        # same key handling and ordering as helperFunctions.updateAirwires
        pins, key_to_index = [], {}
        for key, pin in sorted(members.items(), key=lambda x: x[0]):
            if "_" in key:
                part, encoded = key.rsplit("_", 1)
                number = int(encoded)
            else:
                part, number = key, int(pin)
            key_to_index[key] = len(pins)
            pins.append((part, number, pin_pos(part, number)))
        pre = []
        for key in key_to_index:
            if "_" in key:
                d = key.rsplit("_", 1)[0]
                if d + "_1" in key_to_index and d + "_2" in key_to_index and (key_to_index[d + "_1"], key_to_index[d + "_2"]) not in pre:
                    pre.append((key_to_index[d + "_1"], key_to_index[d + "_2"]))
        edges = _kruskal_mst(pins, pre)
        result[net] = sorted(
            sorted([[cl.clean(v, 4) for v in cl.u2t(pins[i][2])], [cl.clean(v, 4) for v in cl.u2t(pins[j][2])]])
            for i, j in edges
        )
    Path(dst).write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {sum(len(v) for v in result.values())} airwires in {len(result)} nets to {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
