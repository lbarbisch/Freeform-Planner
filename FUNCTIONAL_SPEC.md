# Freeform-Planner Functional Specification

## 1. Project Summary
- Name: Freeform-Planner
- Purpose: 3D freeform PCB / wiring layout planner for small electronics prototypes.
- Technology: Python + Ursina 3D engine.

## 2. Business Goals
- Allow electronics designers to load KiCad netlists and place physical components in a 3D environment.
- Visualize net connections through 3D airwires and movable parts.
- Provide state persistence (load/save .ffps project files).
- Keep a fast edit/rotate/translate workflow with keyboard shortcuts.

## 3. User Roles
- Designer: manipulates components, wires, and layout.
- Reviewer: inspects existing saved projects and netlists.

## 4. Core Features
1. Project management
   - New layout (reset plane and state)
   - Load .net KiCad netlist (calls parser + create components)
   - Load .ffps saved project (pickle-backed data restoration)
   - Save project as .ffps

2. Visual workspace
   - 3D grid plane and skybox
   - origin arrows (XYZ axes)
   - editor camera (orbit, pan, zoom) from Ursina
   - ambient lighting

3. Component model
   - `Component` class + footprints (e.g., resistors, capacitors, transistors)
   - `AIRWIRE` for net wires between pins
   - dynamic footprint swap and component selection highlight

4. Transformation controls
   - translation: 6/4/9/1/8/2
   - rotation: w/s/d/a/e/q (per axis)
   - reset rotation: r
   - swap footprint: f
   - insert wire: CTRL + <custom key>
   - exit: escape

5. Netlist handling
   - `parseKicadNetlist` in `loader.py` identifies comps + nets
   - instantiate components based on symbolic class names in `componentLibrary`
   - generate airwires from net endpoints sequentially

6. Data storage
   - `dataStore` structure:
     - `components` dict: designator->component object
     - `nets` dict: netname->{part:pin}
     - `airwires` dict: netname->{wireindex:AIRWIRE Entity}

## 5. File and Data Format Interfaces
- .net KiCad netlist input
- .ffps project format (Python pickle of `saveStore` dict)
- model meshes from `models/*.mtl` and included prefabs

## 6. Non-functional Requirements
- Should run with low-latency interactive 3D on modern hardware
- Persistence must be robust for network two-pin sequenced nets
- Must be maintainable with modular code (componentLibrary, loader, helperFunctions)
- Prefer cross-platform compatibility (Windows, macOS, Linux)

## 7. Upgrade Plan (Ursina)
- Current dependency in project: `ursina==5.3.0`
- Target: `ursina>=6.0.0` (or latest 5.x/6.x as of 2026)
- Validate API changes for
  - `Ursina(...)` arguments
  - `DropdownMenu` behavior
  - `EditorCamera` and `Entity` with $click layout

## 8. Dependency Management (UV manager)
- Create/maintain `pyproject.toml`
- Use `uv` CLI:
   - `uv init` / `uv add ursina@latest`
   - `uv install`
- Add lockfile `uv.lock` with fixed versions

## 9. Test Strategy
- Unit tests for loader and netlist parser (non-graphical)
- Smoke tests for component instantiation in memory
- Regression tests for save/load roundtrip
- Optional integration test via headless mode or mock `ursina` classes

## 10. Shortcomings & Improvement opportunities
- `loader.parseKicadNetlist` regex is fragile; use strict parser or KiCad XML in future
- No explicit undo/redo or history stack
- No validation if net contains >2 pins (airwires are linear seq only)
- No collision check for overlaps

## 11. Files to add
- `pyproject.toml`
- `tests/test_loader.py`
- `tests/test_parser.py`
- `tests/test_saveload.py`
- `Requirements.txt` update
- `FUNCTIONAL_SPEC.md` (this file)

## 12. Execution flow (simplified)
1. `Planner.py` starts Ursina runtime
2. UI menu is built
3. user loads project/netlist -> `loadComponents`
4. components created using class factory in `componentLibrary`
5. airwire Entities created for consecutive net pairs
6. user selects component: `on_click` highlights and `currentEntity` updates
7. keyboard updates component transform (`button_input`)
8. `update` syncs all wire endpoints via `updateAirwires`
9. save writes `makeSaveStore(dataStore)` to pickle `.ffps`

## 13. Acceptance criteria
- `uv install` completes with dependency lock
- `pytest` passes for new tests
- `Planner.py` opens without crash and can load `transistor_oscillator.net` (at least non-graphical path)
- `.ffps` load/save roundtrip maintains component positions/loot
