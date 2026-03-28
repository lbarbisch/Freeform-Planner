"""
fix_obj_uvs.py

Strips the third (W) component from `vt` lines in all OBJ files under the
models/ folder. Autodesk ATF exports 3D texture coordinates (vt u v w) which
Ursina's mesh importer cannot handle — it expects standard 2D UVs (vt u v).

Creates a .bak backup of each file before modifying it.
"""

import os
import re

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
VT_PATTERN = re.compile(r"^(vt\s+\S+\s+\S+)\s+\S+(.*)$")


def fix_obj_file(filepath: str) -> int:
    """Fix a single OBJ file. Returns the number of lines changed."""
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    changed = 0
    new_lines = []
    for line in lines:
        match = VT_PATTERN.match(line)
        if match:
            # Reconstruct the line with only u and v
            new_line = match.group(1) + (match.group(2) or "") + "\n"
            new_lines.append(new_line)
            changed += 1
        else:
            new_lines.append(line)

    if changed:
        backup = filepath + ".bak"
        os.replace(filepath, backup)
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(new_lines)

    return changed


def main():
    obj_files = [
        os.path.join(root, filename)
        for root, _, files in os.walk(MODELS_DIR)
        for filename in files
        if filename.lower().endswith(".obj")
    ]

    if not obj_files:
        print(f"No OBJ files found in {MODELS_DIR}")
        return

    total_files_fixed = 0
    for filepath in obj_files:
        changed = fix_obj_file(filepath)
        rel = os.path.relpath(filepath, MODELS_DIR)
        if changed:
            print(f"  Fixed {changed:>6} vt lines  ->  {rel}  (backup: {rel}.bak)")
            total_files_fixed += 1
        else:
            print(f"  No changes needed      ->  {rel}")

    print(f"\nDone. {total_files_fixed}/{len(obj_files)} file(s) modified.")


if __name__ == "__main__":
    main()
