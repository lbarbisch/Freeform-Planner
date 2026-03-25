"""Tests for footprints module - component footprint definitions and Pin positioning"""

import os
import pytest
from unittest.mock import Mock, patch, MagicMock

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture
def mock_click_function():
    """Mock click function for footprint instantiation"""
    return Mock()


@pytest.fixture
def mock_ursina_components():
    """Mock Ursina components to avoid GUI dependencies"""
    with patch('footprints.Entity'), \
         patch('footprints.Vec3'), \
         patch('footprints.load_model'), \
         patch('footprints.load_texture'):
        yield


class TestFootprintBase:
    """Tests for the base Footprint class"""
    
    def test_footprint_initialization(self, mock_click_function, mock_ursina_components):
        from footprints import Footprint
        
        footprint = Footprint(designator="TEST1", model="test_model", collider="mesh")
        
        assert footprint.designator == "TEST1"
        assert hasattr(footprint, 'original_color')


class TestRES0603:
    """Tests for 0603 resistor footprint"""
    
    def test_res0603_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import RES0603
        
        res = RES0603(mock_click_function, "R1")
        
        assert res.designator == "R1"
        assert len(res.Pin) == 2
    
    def test_res0603_pin_positions(self, mock_click_function, mock_ursina_components):
        from footprints import RES0603
        
        res = RES0603(mock_click_function, "R1")
        
        # Check that pins have position attributes
        assert hasattr(res.Pin[0], 'position')
        assert hasattr(res.Pin[1], 'position')


class TestRESHTFootprints:
    """Tests for THT resistor footprints"""
    
    def test_restht_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import RESTHT
        
        res = RESTHT(mock_click_function, "R1")
        
        assert res.designator == "R1"
        assert len(res.Pin) == 2
    
    def test_restht_short_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import RESTHT_SHORT
        
        res = RESTHT_SHORT(mock_click_function, "R2")
        
        assert res.designator == "R2"
        assert len(res.Pin) == 2


class TestCAPFootprints:
    """Tests for capacitor footprints"""
    
    def test_cap0603_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import CAP0603
        
        cap = CAP0603(mock_click_function, "C1")
        
        assert cap.designator == "C1"
        assert len(cap.Pin) == 2
    
    def test_captht_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import CAPTHT
        
        cap = CAPTHT(mock_click_function, "C2")
        
        assert cap.designator == "C2"
        assert len(cap.Pin) == 2


class TestLED5MMFootprints:
    """Tests for 5mm LED footprints"""
    
    def test_led5mm_a_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import LED5MM_A
        
        led = LED5MM_A(mock_click_function, "LED1")
        
        assert led.designator == "LED1"
        assert len(led.Pin) == 2
    
    def test_led5mm_b_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import LED5MM_B
        
        led = LED5MM_B(mock_click_function, "LED2")
        
        assert led.designator == "LED2"
        assert len(led.Pin) == 2


class TestDIODETHTFootprint:
    """Tests for THT diode footprint"""
    
    def test_diodetht_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import DIODETHT
        
        diode = DIODETHT(mock_click_function, "D1")
        
        assert diode.designator == "D1"
        assert len(diode.Pin) == 2


class TestSOT23_3Footprint:
    """Tests for SOT-23-3 footprint"""
    
    def test_sot23_3_creates_three_pins(self, mock_click_function, mock_ursina_components):
        from footprints import SOT23_3
        
        sot = SOT23_3(mock_click_function, "Q1")
        
        assert sot.designator == "Q1"
        assert len(sot.Pin) == 3


class TestTO92Footprint:
    """Tests for TO-92 footprint"""
    
    def test_to92_creates_three_pins(self, mock_click_function, mock_ursina_components):
        from footprints import TO92
        
        to92 = TO92(mock_click_function, "Q1")
        
        assert to92.designator == "Q1"
        assert len(to92.Pin) == 3


class TestSOIC8Footprint:
    """Tests for SOIC-8 footprint"""
    
    def test_soic8_creates_eight_pins(self, mock_click_function, mock_ursina_components):
        from footprints import SOIC8
        
        soic8 = SOIC8(mock_click_function, "U1")
        
        assert soic8.designator == "U1"
        assert len(soic8.Pin) == 8


class TestDIP8Footprint:
    """Tests for DIP-8 footprint"""
    
    def test_dip8_creates_eight_pins(self, mock_click_function, mock_ursina_components):
        from footprints import DIP8
        
        dip8 = DIP8(mock_click_function, "U2")
        
        assert dip8.designator == "U2"
        assert len(dip8.Pin) == 8


class TestPINFootprint:
    """Tests for PIN footprint"""
    
    def test_pin_creates_single_pin(self, mock_click_function, mock_ursina_components):
        from footprints import PIN
        
        pin = PIN(mock_click_function, "PIN1")
        
        assert pin.designator == "PIN1"
        assert len(pin.Pin) == 1


class TestWireFootprints:
    """Tests for wire footprints with different aspect ratios"""
    
    def test_wire10x10_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import WIRE10X10
        
        wire = WIRE10X10(mock_click_function, "W1")
        
        assert wire.designator == "W1"
        assert len(wire.Pin) == 2
    
    def test_wire10x20_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import WIRE10X20
        
        wire = WIRE10X20(mock_click_function, "W2")
        
        assert wire.designator == "W2"
        assert len(wire.Pin) == 2
    
    def test_wire20x10_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import WIRE20X10
        
        wire = WIRE20X10(mock_click_function, "W3")
        
        assert wire.designator == "W3"
        assert len(wire.Pin) == 2
    
    def test_wire20x50_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import WIRE20X50
        
        wire = WIRE20X50(mock_click_function, "W4")
        
        assert wire.designator == "W4"
        assert len(wire.Pin) == 2
    
    def test_wire50x20_creates_two_pins(self, mock_click_function, mock_ursina_components):
        from footprints import WIRE50X20
        
        wire = WIRE50X20(mock_click_function, "W5")
        
        assert wire.designator == "W5"
        assert len(wire.Pin) == 2


class TestGenerators:
    """Tests for utility generators"""
    
    def test_position_generator(self):
        from footprints import posGenerator
        
        gen = posGenerator()
        
        # Should generate positions in a grid pattern
        pos1 = next(gen)
        pos2 = next(gen)
        pos3 = next(gen)
        
        assert pos1 == (0, 0, 0)
        assert pos2 == (5, 0, 0)
        # After 10 positions, should wrap to next row
        for _ in range(8):
            next(gen)
        pos11 = next(gen)
        assert pos11[1] == 5  # y should increment
    
    def test_counter_generator(self):
        from footprints import counterGenerator
        
        gen = counterGenerator()
        
        assert next(gen) == 0
        assert next(gen) == 1
        assert next(gen) == 2
        assert next(gen) == 3
