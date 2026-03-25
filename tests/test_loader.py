import os
import pytest
from loader import parseKicadNetlist, _loadNetlist, makeSaveStore

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRANSISTOR_NET = os.path.join(PROJECT_ROOT, 'transistor_oscillator.net')


def test_parseKicadNetlist_returns_components_and_connections():
    components, connections = parseKicadNetlist(TRANSISTOR_NET)

    assert isinstance(components, dict)
    assert isinstance(connections, dict)
    assert "R1" in components or len(components) > 0
    assert len(connections) > 0


def test__loadNetlist_minimal_structure():
    dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)

    assert "components" in dataStore
    assert "nets" in dataStore
    assert "airwires" in dataStore
    assert len(dataStore['components']) > 0
    assert len(dataStore['nets']) > 0


def test_makeSaveStore_roundtrip_consistent():
    dataStore = _loadNetlist(TRANSISTOR_NET, clickFunction=lambda *args, **kwargs: None)
    save_bytes = makeSaveStore(dataStore, debug=0)

    assert isinstance(save_bytes, bytes)
    assert b"components" in save_bytes
    assert b"nets" in save_bytes
