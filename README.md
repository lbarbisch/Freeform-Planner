# Freeform-Planner
Rudimentary 3D layout software to plan freeform electronic installations

## Setup (UV project manager)
1. Install UV: `pip install uv`
2. In project root: `uv install` (reads `pyproject.toml`)
3. To add/update dependencies:
   - `uv add ursina@latest`
   - `uv add pytest@latest --dev`
   - `uv lock`
4. Run app: `python Planner.py`
5. Run tests: `pytest -q` or `uv test` (if configured)

## Notes
- Moved from fixed `ursina==5.3.0` to `ursina>=6.0.0` in `Requirements.txt` / `pyproject.toml`.
- Added `tests/` unit tests for loader and netlist parser.

