import os
import pytest
import re
from netlistParser import parse_kicad_netlist_improved

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRANSISTOR_NET = os.path.join(PROJECT_ROOT, 'transistor_oscillator.net')


class TestParseKicadNetlistImproved:
    """Tests for improved KiCAD netlist parser"""
    
    def test_parse_kicad_netlist_improved_returns_correct_types(self):
        """Test that parser returns dictionaries and lists"""
        components, connections = parse_kicad_netlist_improved(TRANSISTOR_NET)

        assert isinstance(components, dict)
        assert isinstance(connections, list)
    
    def test_parse_kicad_netlist_improved_includes_nets(self):
        """Test that parsed data contains components and connections"""
        components, connections = parse_kicad_netlist_improved(TRANSISTOR_NET)

        assert len(components) > 0
        assert len(connections) > 0
    
    def test_parse_kicad_netlist_improved_components_have_values(self):
        """Test that components are properly mapped with values"""
        components, connections = parse_kicad_netlist_improved(TRANSISTOR_NET)
        
        for ref, value in components.items():
            assert isinstance(ref, str)
            assert isinstance(value, str)
            assert len(ref) > 0
            assert len(value) > 0
    
    def test_parse_kicad_netlist_improved_connections_structure(self):
        """Test that connections have proper structure"""
        components, connections = parse_kicad_netlist_improved(TRANSISTOR_NET)
        
        for connection in connections:
            assert isinstance(connection, tuple)
            assert len(connection) == 2
            
            netname, node_pairs = connection
            assert isinstance(netname, str)
            assert isinstance(node_pairs, list)
            
            # Each node pair should be (ref, pin)
            for ref, pin in node_pairs:
                assert isinstance(ref, str)
                assert isinstance(pin, str)
    
    def test_parse_kicad_netlist_improved_extracts_correct_component_names(self):
        """Test that parser correctly extracts component designators"""
        components, connections = parse_kicad_netlist_improved(TRANSISTOR_NET)
        
        # Should contain common designators
        designators = list(components.keys())
        # Components typically start with R, C, Q, U, etc.
        assert any(d[0] in ['R', 'C', 'Q', 'U', 'L', 'D'] for d in designators)
    
    def test_parse_kicad_netlist_improved_finds_all_nets(self):
        """Test that all nets are extracted"""
        components, connections = parse_kicad_netlist_improved(TRANSISTOR_NET)
        
        # Extract all net names
        netnames = [net_name for net_name, _ in connections]
        
        # Should have some named nets
        assert len(netnames) > 0
        
        # Should not have "unconnected" as a full net (KiCAD specific)
        # Most nets should be named (non-empty)
        assert all(isinstance(name, str) and len(name) > 0 for name in netnames)
    
    def test_parse_kicad_netlist_improved_extracts_connections(self):
        """Test that connections properly link components"""
        components, connections = parse_kicad_netlist_improved(TRANSISTOR_NET)
        
        # At least one connection should reference known components
        found_matching_ref = False
        component_refs = set(components.keys())
        
        for netname, node_pairs in connections:
            for ref, pin in node_pairs:
                if ref in component_refs:
                    found_matching_ref = True
                    break
            if found_matching_ref:
                break
        
        assert found_matching_ref, "No connections reference known components"
