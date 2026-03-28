# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Freeform-Planner
# Build with:  pyinstaller Planner.spec

import os
import sys
import sysconfig
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, collect_dynamic_libs

block_cipher = None

# Locate the Python DLL (lives in base Python dir, not the venv)
_py_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
_py_dll_path = os.path.join(os.path.dirname(sys._base_executable), _py_dll_name)
_extra_binaries = [(_py_dll_path, '.')] if os.path.exists(_py_dll_path) else []

# Collect all data files that Ursina and Panda3D need at runtime
ursina_datas = collect_data_files('ursina')
panda3d_datas = collect_data_files('panda3d')   # includes etc/Config.prc
panda3d_libs = collect_dynamic_libs('panda3d')   # libpandagl.dll, libpandadx9.dll, etc.

# Our own runtime assets
local_datas = [
    ('models',            'models'),
    ('models_compressed', 'models_compressed'),
    ('KiCAD_Library',     'KiCAD_Library'),
]

a = Analysis(
    ['Planner.py'],
    pathex=['.'],
    binaries=_extra_binaries + panda3d_libs,
    datas=ursina_datas + panda3d_datas + local_datas,
    hiddenimports=[
        # Ursina sub-packages that PyInstaller may miss
        'ursina.prefabs.dropdown_menu',
        'ursina.prefabs.file_browser',
        'ursina.prefabs.file_browser_save',
        'ursina.shaders',
        # project modules
        'componentLibrary',
        'loader',
        'helperFunctions',
        'settings',
        'footprints',
        'netlistParser',
        # runtime deps
        'numpy',
        'panda3d',
        'panda3d.core',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['pytest', 'tests'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Freeform-Planner',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,          # no black terminal window behind the GUI
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='Freeform-Planner',
)
