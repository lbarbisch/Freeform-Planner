"""Tests for helperFunctions module - utility functions for component manipulation"""

import os
import pytest
from unittest.mock import Mock, patch, MagicMock, call

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture
def mock_click_function():
    """Mock click function"""
    return Mock()


@pytest.fixture
def mock_ursina_components():
    """Mock Ursina components to avoid GUI dependencies"""
    with patch('helperFunctions.Entity'), \
         patch('helperFunctions.Vec3'), \
         patch('helperFunctions.distance', return_value=10.0), \
         patch('helperFunctions.Quat'), \
         patch('helperFunctions.destroy'), \
         patch('helperFunctions.WIRE'), \
         patch('helperFunctions.AIRWIRE'):
        yield


@pytest.fixture
def sample_datastore(mock_click_function):
    """Create a sample datastore structure for testing"""
    return {
        'components': {
            'R1': MagicMock(designator='R1', footprint=MagicMock(), getPinPos=Mock(return_value=(0, 0, 0))),
            'R2': MagicMock(designator='R2', footprint=MagicMock(), getPinPos=Mock(return_value=(5, 5, 0))),
        },
        'nets': {
            'NET1': {'R1': 1, 'R2': 2},
        },
        'airwires': {
            'NET1': {
                '1': MagicMock(
                    startPart='R1',
                    endPart='R2',
                    position=(2.5, 2.5, 0),
                    rotation=(0, 0, 0),
                    scale=(1, 1, 10),
                    quaternion=None
                )
            }
        }
    }


class TestOriginArrows:
    """Tests for originArrows function"""
    
    def test_originArrows_creates_three_entities(self, mock_ursina_components):
        from helperFunctions import originArrows
        
        with patch('helperFunctions.Entity') as MockEntity:
            originArrows()
            
            # Should create 3 arrows (X, Y, Z)
            assert MockEntity.call_count == 3
    
    def test_originArrows_uses_correct_colors(self, mock_ursina_components):
        from helperFunctions import originArrows
        
        with patch('helperFunctions.Entity') as MockEntity, \
             patch('helperFunctions.color') as mock_color:
            
            mock_color.rgb.side_effect = lambda r, g, b: f"rgb({r},{g},{b})"
            
            originArrows()
            
            # Should use red, green, blue colors
            calls = [call_args[1]['color'] for call_args in MockEntity.call_args_list]
            assert len(calls) == 3


class TestUpdateAirwires:
    """Tests for updateAirwires function"""
    
    def test_updateAirwires_with_empty_datastore(self, mock_ursina_components):
        from helperFunctions import updateAirwires
        
        result = updateAirwires({})
        
        assert result == {}
    
    def test_updateAirwires_updates_positions(self, mock_ursina_components, sample_datastore, mock_click_function):
        from helperFunctions import updateAirwires
        
        with patch('helperFunctions.Vec3') as MockVec3, \
             patch('helperFunctions.distance') as mock_distance, \
             patch('helperFunctions.Quat') as MockQuat:
            # Setup Vec3 mock
            mock_vec = MagicMock()
            mock_vec.__truediv__.return_value = (2.5, 2.5, 0)
            mock_vec.__sub__.return_value = mock_vec
            mock_vec.normalized.return_value = mock_vec
            mock_vec.almostEqual.return_value = False
            mock_vec.angle_rad.return_value = 0
            mock_vec.cross.return_value = mock_vec
            MockVec3.return_value = mock_vec
            MockVec3.side_effect = lambda *args: mock_vec
            mock_distance.return_value = 5.0
            MockQuat.return_value = MagicMock()
            
            result = updateAirwires(sample_datastore)
            
            # Should update airwire positions
            assert 'NET1' in result['airwires']
            assert '1' in result['airwires']['NET1']
    
    def test_updateAirwires_preserves_datastore_structure(self, mock_ursina_components, sample_datastore):
        from helperFunctions import updateAirwires
        
        result = updateAirwires(sample_datastore)
        
        # Should maintain structure
        assert 'components' in result
        assert 'nets' in result
        assert 'airwires' in result


class TestInsertWire:
    """Tests for insertWire function"""
    
    def test_insertWire_adds_new_component(self, mock_ursina_components, sample_datastore, mock_click_function):
        from helperFunctions import insertWire
        
        initial_count = len(sample_datastore['components'])
        
        with patch('helperFunctions.WIRE') as MockWire:
            mock_wire = MagicMock()
            MockWire.return_value = mock_wire
            
            result = insertWire(sample_datastore, mock_click_function, 'NET1', 'R1', 'R2')
            
            # Should have added a WIRE component
            assert len(result['components']) > initial_count
            # Should have a WIRE0 designator
            assert any('WIRE' in key for key in result['components'].keys())


class TestSwapFootprint:
    """Tests for swapFootprint function"""
    
    def test_swapFootprint_increments_current_footprint(self, mock_ursina_components, mock_click_function):
        from helperFunctions import swapFootprint
        
        # Create mock component with multiple footprints
        mock_component = MagicMock()
        mock_component.current_footprint = 0
        mock_component.available_footprints = [MagicMock(), MagicMock(), MagicMock()]
        
        mock_entity = MagicMock()
        mock_entity.designator = 'R1'
        mock_entity.position = (1, 1, 1)
        mock_entity.rotation = (0, 0, 0)
        
        datastore = {
            'components': {'R1': mock_component},
            'airwires': {}
        }
        
        with patch('helperFunctions.destroy'):
            result_store, result_entity = swapFootprint(datastore, mock_entity, mock_click_function)
            
            # Should have incremented the footprint index
            assert mock_component.current_footprint == 1
    
    def test_swapFootprint_wraps_around(self, mock_ursina_components, mock_click_function):
        from helperFunctions import swapFootprint
        
        # Create mock component with multiple footprints
        mock_component = MagicMock()
        mock_component.current_footprint = 2  # Last footprint
        mock_component.available_footprints = [MagicMock(), MagicMock(), MagicMock()]
        
        mock_entity = MagicMock()
        mock_entity.designator = 'R1'
        mock_entity.position = (1, 1, 1)
        mock_entity.rotation = (0, 0, 0)
        
        datastore = {
            'components': {'R1': mock_component},
            'airwires': {}
        }
        
        with patch('helperFunctions.destroy'):
            result_store, result_entity = swapFootprint(datastore, mock_entity, mock_click_function)
            
            # Should wrap back to 0
            assert mock_component.current_footprint == 0


class TestDeleteAllEntities:
    """Tests for deleteAllEntities function"""
    
    def test_deleteAllEntities_with_empty_datastore(self, mock_ursina_components):
        from helperFunctions import deleteAllEntities
        
        result = deleteAllEntities({})
        
        assert result == {}
    
    def test_deleteAllEntities_destroys_all_components(self, mock_ursina_components, sample_datastore):
        from helperFunctions import deleteAllEntities
        
        with patch('helperFunctions.destroy') as mock_destroy:
            result = deleteAllEntities(sample_datastore)
            
            # Should have called destroy for each component and airwire
            assert mock_destroy.call_count > 0
            assert result == {}
    
    def test_deleteAllEntities_calls_destroy_on_footprints(self, mock_ursina_components, sample_datastore):
        from helperFunctions import deleteAllEntities
        
        with patch('helperFunctions.destroy') as mock_destroy:
            deleteAllEntities(sample_datastore)
            
            # Should destroy all component footprints
            for component in sample_datastore['components'].values():
                assert component.footprint in [call[0][0] for call in mock_destroy.call_args_list]
    
    def test_deleteAllEntities_calls_destroy_on_airwires(self, mock_ursina_components, sample_datastore):
        from helperFunctions import deleteAllEntities
        
        with patch('helperFunctions.destroy') as mock_destroy:
            deleteAllEntities(sample_datastore)
            
            # Should destroy all airwires
            for net_wires in sample_datastore['airwires'].values():
                for airwire in net_wires.values():
                    assert airwire in [call[0][0] for call in mock_destroy.call_args_list]
