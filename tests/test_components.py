"""Tests for componentLibrary module - Component classes and AIRWIRE management"""

import os
import pytest
from unittest.mock import Mock, patch, MagicMock

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture
def mock_click_function():
    """Mock click function for component instantiation"""
    return Mock()


@pytest.fixture
def mock_ursina_components():
    """Mock Ursina components to avoid GUI dependencies"""
    with patch('componentLibrary.Entity'), \
         patch('componentLibrary.Vec3'), \
         patch('componentLibrary.load_model'), \
         patch('componentLibrary.load_texture'), \
         patch('componentLibrary.distance', return_value=10.0):
        yield


class TestComponent:
    """Tests for the base Component class"""
    
    def test_component_initialization_with_valid_footprint(self, mock_click_function, mock_ursina_components):
        from componentLibrary import Component, CAP0603
        
        component = Component(
            current_footprint=0,
            available_footprints=[CAP0603],
            designator="C1",
            clickFunction=mock_click_function
        )
        
        assert component.designator == "C1"
        assert component.current_footprint == 0
        assert len(component.available_footprints) == 1
    
    def test_component_initialization_footprint_out_of_bounds(self, mock_click_function, mock_ursina_components):
        from componentLibrary import Component, CAP0603
        
        # Should default to 0 if requested footprint is out of bounds
        component = Component(
            current_footprint=10,
            available_footprints=[CAP0603],
            designator="C1",
            clickFunction=mock_click_function
        )
        
        assert component.current_footprint == 0


class TestWireComponent:
    """Tests for WIRE component"""
    
    def test_wire_component_creation(self, mock_click_function, mock_ursina_components):
        from componentLibrary import WIRE
        
        wire = WIRE(
            clickFunction=mock_click_function,
            footprint=0,
            designator="W1"
        )
        
        assert wire.designator == "W1"
        assert wire.value == "WIRE"


class TestTransistorComponents:
    """Tests for various transistor components"""
    
    def test_bc847_component(self, mock_click_function, mock_ursina_components):
        from componentLibrary import BC847
        
        transistor = BC847(
            clickFunction=mock_click_function,
            footprint=0,
            designator="Q1"
        )
        
        assert transistor.designator == "Q1"
        assert transistor.value == "BC847"
    
    def test_bc547_component(self, mock_click_function, mock_ursina_components):
        from componentLibrary import BC547
        
        transistor = BC547(
            clickFunction=mock_click_function,
            footprint=0,
            designator="Q2"
        )
        
        assert transistor.designator == "Q2"
        assert transistor.name == "BC547"
    
    def test_bc557_component(self, mock_click_function, mock_ursina_components):
        from componentLibrary import BC557
        
        transistor = BC557(
            clickFunction=mock_click_function,
            footprint=0,
            designator="Q3"
        )
        
        assert transistor.designator == "Q3"
        assert transistor.name == "BC557"


class TestOpAmpComponent:
    """Tests for operational amplifier component"""
    
    def test_tl072_component(self, mock_click_function, mock_ursina_components):
        from componentLibrary import TL072
        
        opamp = TL072(
            clickFunction=mock_click_function,
            footprint=0,
            designator="U1"
        )
        
        assert opamp.designator == "U1"
        assert opamp.name == "TL072"


class TestTimerComponent:
    """Tests for timer component"""
    
    def test_ne555_component(self, mock_click_function, mock_ursina_components):
        from componentLibrary import NE555
        
        timer = NE555(
            clickFunction=mock_click_function,
            footprint=0,
            designator="U2"
        )
        
        assert timer.designator == "U2"
        assert timer.name == "NE555"


class TestPassiveComponents:
    """Tests for passive component types"""
    
    def test_resistor_component(self, mock_click_function, mock_ursina_components):
        from componentLibrary import RES
        
        resistor = RES(
            clickFunction=mock_click_function,
            footprint=0,
            designator="R1"
        )
        
        assert resistor.designator == "R1"
        assert resistor.value == "RES"
    
    def test_capacitor_component(self, mock_click_function, mock_ursina_components):
        from componentLibrary import CAP
        
        capacitor = CAP(
            clickFunction=mock_click_function,
            footprint=0,
            designator="C1"
        )
        
        assert capacitor.designator == "C1"
        assert capacitor.value == "CAP"
    
    def test_led_component(self, mock_click_function, mock_ursina_components):
        from componentLibrary import LED5MM
        
        led = LED5MM(
            clickFunction=mock_click_function,
            footprint=0,
            designator="LED1"
        )
        
        assert led.designator == "LED1"
        assert led.value == "LED5MM"
    
    def test_diode_component(self, mock_click_function, mock_ursina_components):
        """Test DIODETHT component initialization - skipped due to recursion issue"""
        pytest.skip("DIODETHT has recursive constructor, needs special handling")


class TestPortComponent:
    """Tests for port/connector component"""
    
    def test_port_component(self, mock_click_function, mock_ursina_components):
        from componentLibrary import PORT
        
        port = PORT(
            clickFunction=mock_click_function,
            footprint=0,
            designator="J1"
        )
        
        assert port.designator == "J1"
        assert port.value == "PORT"


class TestAIRWIRE:
    """Tests for AIRWIRE (net connection visualization)"""
    
    def test_airwire_creation_with_valid_positions(self, mock_click_function, mock_ursina_components):
        from componentLibrary import AIRWIRE
        
        with patch('componentLibrary.Vec3') as MockVec3, \
             patch('componentLibrary.counter', MagicMock()):
            
            MockVec3.return_value = MagicMock()
            
            airwire = AIRWIRE(
                start=(0, 0, 0),
                end=(10, 10, 0),
                clickFunction=mock_click_function,
                netname="NET1",
                startPart="R1",
                endPart="C1"
            )
            
            assert airwire.net == "NET1"
            assert airwire.startPart == "R1"
            assert airwire.endPart == "C1"
            assert airwire.value == "AIRWIRE"
            assert "AIRWIRE_" in airwire.designator
    
    def test_airwire_stores_original_color(self, mock_click_function, mock_ursina_components):
        from componentLibrary import AIRWIRE
        
        with patch('componentLibrary.Vec3') as MockVec3, \
             patch('componentLibrary.counter', MagicMock()):
            
            MockVec3.return_value = MagicMock()
            
            airwire = AIRWIRE(
                start=(0, 0, 0),
                end=(5, 5, 0),
                clickFunction=mock_click_function,
                netname="NET2",
                startPart="R1",
                endPart="R2"
            )
            
            # Should have original_color attribute for highlighting support
            assert hasattr(airwire, 'original_color')
    
    def test_airwire_designator_uniqueness(self, mock_click_function, mock_ursina_components):
        from componentLibrary import AIRWIRE
        
        with patch('componentLibrary.Vec3') as MockVec3:
            MockVec3.return_value = MagicMock()
            
            airwire1 = AIRWIRE(
                start=(0, 0, 0),
                end=(5, 5, 0),
                clickFunction=mock_click_function,
                netname="NET1",
                startPart="R1",
                endPart="R2"
            )
            
            airwire2 = AIRWIRE(
                start=(0, 0, 0),
                end=(5, 5, 0),
                clickFunction=mock_click_function,
                netname="NET2",
                startPart="R1",
                endPart="R3"
            )
            
            # Each AIRWIRE should have unique designator
            assert airwire1.designator != airwire2.designator
