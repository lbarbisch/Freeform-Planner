import os
from netlistParser import parse_kicad_netlist_improved

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRANSISTOR_NET = os.path.join(PROJECT_ROOT, 'tests/transistor_oscillator.net')


def test_parse_kicad_netlist_improved_includes_nets():
    components, connections = parse_kicad_netlist_improved(TRANSISTOR_NET)

    assert isinstance(components, dict)
    assert isinstance(connections, list)
    assert len(components) > 0
    assert len(connections) > 0
