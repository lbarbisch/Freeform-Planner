import os
import pytest
import pickle
from unittest.mock import Mock, patch, MagicMock
from loader import parseKicadNetlist, _loadNetlist, makeSaveStore, loadComponents

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRANSISTOR_NET = os.path.join(PROJECT_ROOT, 'tests/transistor_oscillator.net')
TRANSISTOR_FFPS = os.path.join(PROJECT_ROOT, 'tests/transistor_oscillator.ffps')


class TestParseKicadNetlist:
    """Tests for netlist parsing from KiCAD files"""
    
    def test_parseKicadNetlist_returns_components_and_connections(self):
        """Test that parseKicadNetlist returns properly typed dictionaries"""
        components, connections = parseKicadNetlist(TRANSISTOR_NET)

        assert isinstance(components, dict)
        assert isinstance(connections, dict)
        assert "R1" in components or len(components) > 0
        assert len(connections) > 0
    
    def test_parseKicadNetlist_components_have_values(self):
        """Test that components are mapped to their values"""
        components, connections = parseKicadNetlist(TRANSISTOR_NET)
        
        # Each component should have a non-empty value
        for designator, value in components.items():
            assert isinstance(designator, str)
            assert isinstance(value, str)
            assert len(value) > 0
    
    def test_parseKicadNetlist_connections_structure(self):
        """Test that connections have correct structure"""
        components, connections = parseKicadNetlist(TRANSISTOR_NET)
        
        # Each connection should map to component-pin pairs
        for netname, nodes in connections.items():
            assert isinstance(netname, str)
            assert isinstance(nodes, dict)
            for designator, pinnumber in nodes.items():
                assert isinstance(designator, str)
                assert isinstance(pinnumber, str)


class TestLoadNetlist:
    """Tests for loading and instantiating components from netlists"""
    
    def test_loadNetlist_minimal_structure(self):
        """Test that loaded netlist has expected structure"""
        dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)

        assert "components" in dataStore
        assert "nets" in dataStore
        assert "airwires" in dataStore
        assert len(dataStore['components']) > 0
        assert len(dataStore['nets']) > 0
    
    def test_loadNetlist_components_dict(self):
        """Test that components dict is properly populated"""
        dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)
        
        components = dataStore['components']
        # Each component should have a designator and footprint
        for designator, component in components.items():
            assert hasattr(component, 'designator')
            assert hasattr(component, 'footprint')
            assert hasattr(component, 'value')
    
    def test_loadNetlist_nets_dict(self):
        """Test that nets dict preserves connections"""
        dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)
        
        nets = dataStore['nets']
        # nets should not include "unconnected"
        for netname in nets.keys():
            assert "unconnected" not in netname
    
    def test_loadNetlist_airwires_structure(self):
        """Test that airwires are created with correct structure"""
        dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)
        
        airwires = dataStore['airwires']
        # Each airwire should connect two parts
        for netname, wire_dict in airwires.items():
            assert isinstance(wire_dict, dict)
            for wire_id, airwire in wire_dict.items():
                assert hasattr(airwire, 'startPart')
                assert hasattr(airwire, 'endPart')
                assert hasattr(airwire, 'net')
    
    def test_loadNetlist_with_empty_clickfunction(self):
        """Test loading netlist without click function (for testing)"""
        dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction={})
        
        # Should still have basic structure even without GUI
        assert "components" in dataStore
        assert "nets" in dataStore
        assert "airwires" in dataStore


class TestMakeSaveStore:
    """Tests for saving and serialization of component data"""
    
    def test_makeSaveStore_returns_bytes(self):
        """Test that makeSaveStore returns pickle bytes"""
        dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)
        save_bytes = makeSaveStore(dataStore, debug=0)

        assert isinstance(save_bytes, bytes)
    
    def test_makeSaveStore_contains_required_sections(self):
        """Test that save file contains components and nets"""
        dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)
        save_bytes = makeSaveStore(dataStore, debug=0)

        assert b"components" in save_bytes
        assert b"nets" in save_bytes
    
    def test_makeSaveStore_roundtrip_consistent(self):
        """Test that saved data can be unpickled back"""
        dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)
        save_bytes = makeSaveStore(dataStore, debug=0)
        
        # Should be able to unpickle the saved data
        loaded = pickle.loads(save_bytes)
        assert "components" in loaded
        assert "nets" in loaded
    
    def test_makeSaveStore_preserves_component_data(self):
        """Test that component metadata is preserved in save"""
        dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)
        save_bytes = makeSaveStore(dataStore, debug=0)
        
        loaded = pickle.loads(save_bytes)
        components = loaded['components']
        
        # Each component should have value, rotation, position, footprint
        for designator, comp_data in components.items():
            assert 'value' in comp_data
            assert 'rotation' in comp_data
            assert 'position' in comp_data
            assert 'footprint' in comp_data


class TestLoadComponents:
    """Tests for the main loadComponents dispatcher function"""
    
    def test_loadComponents_netlist_file(self):
        """Test loading a .net netlist file"""
        dataStore = loadComponents(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)
        
        assert "components" in dataStore
        assert "nets" in dataStore
        assert "airwires" in dataStore
    
    @pytest.mark.skipif(not os.path.exists(TRANSISTOR_FFPS), reason="transistor_oscillator.ffps not found")
    def test_loadComponents_project_file(self):
        """Test loading a .ffps project file"""
        dataStore = loadComponents(TRANSISTOR_FFPS, clickFunction=lambda *args, **kwargs: None)
        
        assert "components" in dataStore
        assert "nets" in dataStore
    
    def test_loadComponents_invalid_file_format(self):
        """Test that loadComponents handles unsupported file formats"""
        # Should not match .net or .ffps
        # The function returns None for unsupported formats
        result = loadComponents("test.txt", clickFunction=lambda *args, **kwargs: None)
        assert result is None
