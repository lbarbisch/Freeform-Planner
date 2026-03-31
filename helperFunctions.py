from ursina import *
from settings import *
from componentLibrary import *
import traceback
import re

# draws red, green and blue arrows at origin to show X, Y and Z axis
def originArrows():
    Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(255, 0, 0), rotation = (0,   0,   0), unlit=True)
    Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(0, 255, 0), rotation = (0,   0, -90), unlit=True)
    Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(0, 0, 255), rotation = (0, -90,   0), unlit=True)

def _kruskal_mst(pins, preconnected=None):
    """Compute a Minimum Spanning Tree over the given pins using Kruskal's algorithm.

    Args:
        pins:         list of (part_name, pin_number, position) tuples
        preconnected: optional list of (i, j) index pairs that are already
                      physically connected (e.g. by a WIRE component).  These
                      are pre-unioned in the Union-Find before the main loop so
                      Kruskal treats them as existing edges, but they are NOT
                      included in the returned mst_edges (no airwire is drawn).

    Returns:
        List of (i, j) index pairs into `pins` that form the MST edges where
        an airwire should be drawn.  Returns [] when len(pins) < 2.
    """
    n = len(pins)
    if n < 2:
        return []

    # Build every possible edge sorted by 3-D distance
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            d = distance(pins[i][2], pins[j][2])
            edges.append((d, i, j))
    edges.sort(key=lambda e: e[0])

    # Union-Find with path compression and union by rank
    parent = list(range(n))
    rank   = [0] * n

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]   # path halving
            x = parent[x]
        return x

    def union(x, y):
        px, py = find(x), find(y)
        if px == py:
            return False
        if rank[px] < rank[py]:
            parent[px] = py
        elif rank[px] > rank[py]:
            parent[py] = px
        else:
            parent[py] = px
            rank[px] += 1
        return True

    # Pre-union WIRE-connected pin pairs; these count toward spanning the tree
    # but must NOT produce airwire edges.
    pre_count = 0
    if preconnected:
        for i, j in preconnected:
            if union(i, j):
                pre_count += 1

    mst_edges = []
    for d, i, j in edges:
        if union(i, j):
            mst_edges.append((i, j))
            if len(mst_edges) + pre_count == n - 1:
                break

    return mst_edges


def _orient_airwire(airwire, start_pos, end_pos):
    """Apply position, scale, and rotation to an existing AIRWIRE entity."""
    midpoint = (Vec3(start_pos) + Vec3(end_pos)) / 2
    length   = distance(start_pos, end_pos)
    airwire.position = midpoint
    airwire.scale    = (airwire_thickness, airwire_thickness, length)
    if start_pos != end_pos:
        direction = (Vec3(end_pos) - Vec3(start_pos)).normalized()
        if not (Vec3(0, 0, 1).almostEqual(direction, 0.00101) or
                Vec3(0, 0, -1).almostEqual(direction, 0.00101)):
            fixed_direction    = Vec3(0, 0, 1)
            rotation_quaternion = Quat()
            rotation_quaternion.set_from_axis_angle_rad(
                fixed_direction.angle_rad(direction),
                fixed_direction.cross(direction).normalized())
            airwire.quaternion = rotation_quaternion
        else:
            airwire.rotation = Vec3(0, 0, 1)


def updateAirwires(dataStore, clickFunction=None):
    """Recompute airwire entities for every net so they form a Minimum Spanning
    Tree (MST) over the net's pins.  Kruskal's algorithm is used to find the
    MST.  Surplus AIRWIRE entities (left over from a previous layout that had
    more edges) are destroyed; missing ones are created on the fly when a
    clickFunction is available."""
    if dataStore == {}:
        return dataStore

    nets = dataStore['nets']
    for netname in list(nets.keys()):
        # Collect current pin positions, sorted by part name for stable ordering
        # Keys may be plain component designators, or use the WIRE0_2 convention
        # (designator + '_' + pin_number) to allow a single component to appear
        # twice in one net dict without a key collision.
        pin_list = sorted(nets[netname].items(), key=lambda x: x[0])
        pins = []
        key_to_index = {}  # net-key -> index in pins
        for key, pin in pin_list:
            if '_' in key:
                part, encoded_pin = key.rsplit('_', 1)
                pin_number = int(encoded_pin)
            else:
                part = key
                pin_number = int(pin)
            if part not in dataStore['components']:
                print(f"updateAirwires: skipping pin {part} {pin_number} in net {netname} – component not loaded")
                continue
            pos = dataStore['components'][part].getPinPos(pin_number)
            key_to_index[key] = len(pins)
            pins.append((part, pin_number, pos))

        # Identify WIRE pin pairs: entries sharing the same DESIGNATOR via _1 / _2
        # keys.  Each such pair is already physically connected – treat them as
        # pre-connected edges so Kruskal doesn't draw an airwire for them.
        wire_designators = set()
        for key in key_to_index:
            if '_' in key:
                designator, _ = key.rsplit('_', 1)
                wire_designators.add(designator)

        preconnected = []
        for designator in wire_designators:
            k1 = designator + '_1'
            k2 = designator + '_2'
            if k1 in key_to_index and k2 in key_to_index:
                preconnected.append((key_to_index[k1], key_to_index[k2]))

        airwires = dataStore['airwires'].setdefault(netname, {})

        if len(pins) < 2:
            # Net has fewer than two endpoints – destroy any stale airwires
            for key in list(airwires.keys()):
                destroy(airwires.pop(key))
            continue

        # Compute MST – WIRE pre-connections are honoured, only remaining
        # gaps produce airwire edges.
        mst_edges = _kruskal_mst(pins, preconnected)

        # Resolve clickFunction: use the supplied one, or borrow from an existing entity
        click_fn = clickFunction
        if click_fn is None and airwires:
            click_fn = next(iter(airwires.values())).on_click

        # Update or create one AIRWIRE entity per MST edge
        for idx, (i, j) in enumerate(mst_edges):
            key = str(idx + 1)
            start_part, _sp, start_pos = pins[i]
            end_part,   _ep, end_pos   = pins[j]

            if key in airwires:
                airwire = airwires[key]
            elif click_fn is not None:
                airwire = AIRWIRE(start_pos, end_pos, click_fn, netname, start_part, end_part)
                airwires[key] = airwire
            else:
                continue  # cannot create without a click function

            _orient_airwire(airwire, start_pos, end_pos)
            airwire.startPart = start_part
            airwire.endPart   = end_part

        # Destroy surplus airwires that belong to edges no longer in the MST
        surplus = [k for k in list(airwires.keys())
                   if k.isdigit() and int(k) > len(mst_edges)]
        for key in surplus:
            destroy(airwires.pop(key))

    return dataStore

def insertWire(dataStore, clickFunction, netName, startPart, endPart):
    # create new wire Entity which is basically a normal component
    counter = 0
    while 'WIRE' + str(counter) in dataStore['components'].keys():
        counter += 1
    wireDesignator = 'WIRE' + str(counter)
    dataStore['components'][wireDesignator] = WIRE(clickFunction, 0, wireDesignator)

    # Add both pins of the WIRE to the same net using the DESIGNATOR__PIN
    # key convention so both entries can coexist in the net dict.
    # The MST algorithm in updateAirwires will automatically draw the correct airwires.
    dataStore['nets'][netName][wireDesignator + '_1'] = 1
    dataStore['nets'][netName][wireDesignator + '_2'] = 2

    return dataStore

def removeWire(dataStore, designator):
    # first check if designator is even deletable
    if "WIRE" not in designator:
        return dataStore

    # Remove both pin entries for this WIRE from whichever net they belong to
    pin1_key = designator + '_1'
    pin2_key = designator + '_2'
    for netname, parts in dataStore['nets'].items():
        if pin1_key in parts:
            del parts[pin1_key]
        if pin2_key in parts:
            del parts[pin2_key]

    # Destroy the WIRE footprint entity and remove from components
    destroy(dataStore['components'][designator].footprint)
    del dataStore['components'][designator]

    return dataStore

def swapFootprint(dataStore, currentEntity, clickFunction):
    temp_component = dataStore['components'][currentEntity.designator]
    temp_position = currentEntity.position
    temp_rotation = currentEntity.rotation
    # check if current footprint is not the last possible in the array
    if temp_component.current_footprint + 1 < len(temp_component.available_footprints):
        new_footprint = temp_component.current_footprint + 1
    else:
        new_footprint = 0

    try:
        new_entity = temp_component.available_footprints[new_footprint](clickFunction, temp_component.designator)
    except Exception as e:
        print(f"[swapFootprint] Failed to load footprint {new_footprint}: {e}")
        return dataStore, currentEntity   # leave everything unchanged

    destroy(currentEntity)

    temp_component.footprint = new_entity
    currentEntity = temp_component.footprint
    currentEntity.position = temp_position
    currentEntity.rotation = temp_rotation
    temp_component.current_footprint = new_footprint
    return dataStore, currentEntity

def deleteAllEntities(dataStore):
    if dataStore != {}:
        components = dataStore['components']
        for part in components.keys():
            destroy(components[part].footprint)

        airwires = dataStore['airwires']
        for nets in airwires.keys():
            for number in list(airwires[nets].keys()):
                destroy(airwires[nets][number])
    return {}


def export_scene_obj(dataStore, filepath):
    """Export all components and airwires to Wavefront OBJ + MTL files."""
    from panda3d.core import GeomVertexReader, LPoint3f, ColorAttrib
    import os as _os

    if not dataStore:
        print("[export] Nothing to export – load a project first.")
        return

    mtl_filepath = _os.path.splitext(filepath)[0] + '.mtl'
    models_dir   = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'models')

    obj_lines    = ["# Freeform Planner – 3D Scene Export",
                    f"mtllib {_os.path.basename(mtl_filepath)}"]
    mtl_lines    = ["# Freeform Planner – Material Library"]
    v_offset     = [0]
    mat_registry = {}
    mat_counter  = [0]

    def _find_model_file(model_name, ext):
        if not model_name:
            return None
        for root, _dirs, _files in _os.walk(models_dir):
            path = _os.path.join(root, model_name + ext)
            if _os.path.isfile(path):
                return path
        return None

    def _parse_mtl(mtl_path):
        """Parse a .mtl file → {mat_name: (r, g, b, a, ka, ks, ns)}."""
        materials = {}
        cur = None
        kd = [.8, .8, .8];  ka = [.2, .2, .2];  ks = [.5, .5, .5];  d = 1.0;  ns = 32.0

        def _save():
            if cur is not None:
                materials[cur] = (kd[0], kd[1], kd[2], d, sum(ka) / 3, sum(ks) / 3, ns)

        try:
            with open(mtl_path, 'r', encoding='utf-8', errors='replace') as fh:
                for line in fh:
                    p = line.split()
                    if not p or p[0].startswith('#'):
                        continue
                    if   p[0] == 'newmtl' and len(p) >= 2:
                        _save();  cur = ' '.join(p[1:])
                        kd=[.8,.8,.8];  ka=[.2,.2,.2];  ks=[.5,.5,.5];  d=1.0;  ns=32.0
                    elif p[0] == 'Kd' and len(p) >= 4:  kd = [float(p[1]), float(p[2]), float(p[3])]
                    elif p[0] == 'Ka' and len(p) >= 4:  ka = [float(p[1]), float(p[2]), float(p[3])]
                    elif p[0] == 'Ks' and len(p) >= 4:  ks = [float(p[1]), float(p[2]), float(p[3])]
                    elif p[0] == 'Ns' and len(p) >= 2:  ns = float(p[1])
                    elif p[0] == 'd'  and len(p) >= 2:  d  = float(p[1])
            _save()
        except Exception as exc:
            print(f"[export] Warning: could not parse {mtl_path}: {exc}")
        return materials

    def _parse_obj(obj_path):
        """Parse a .obj file → (verts, sections).
        verts    – list of (x, y, z)
        sections – list of (mat_name, [[vi, …], …]) per usemtl block
        """
        verts = [];  sections = [];  cur_mat = None;  cur_faces = []
        try:
            with open(obj_path, 'r', encoding='utf-8', errors='replace') as fh:
                for raw in fh:
                    if raw.startswith('v ') or raw.startswith('v\t'):
                        p = raw.split()
                        verts.append((float(p[1]), float(p[2]), float(p[3])))
                    elif raw.startswith('usemtl'):
                        if cur_faces:
                            sections.append((cur_mat, cur_faces))
                        cur_mat = raw[7:].strip();  cur_faces = []
                    elif raw.startswith('f ') or raw.startswith('f\t'):
                        n = len(verts);  vis = []
                        for tok in raw.split()[1:]:
                            i = int(tok.split('/')[0])
                            vis.append(i if i > 0 else n + i + 1)
                        cur_faces.append(vis)
            if cur_faces:
                sections.append((cur_mat, cur_faces))
        except Exception as exc:
            print(f"[export] Warning: could not parse {obj_path}: {exc}")
        return verts, sections

    def _register_mat(r, g, b, a, ka, ks, ns):
        """Deduplicate and register a material; return its export name."""
        key = (round(r,4), round(g,4), round(b,4), round(a,4),
               round(ka,4), round(ks,4), round(ns,2))
        if key in mat_registry:
            return mat_registry[key]
        mat_counter[0] += 1
        name = f"mat_{mat_counter[0]:04d}"
        mat_registry[key] = name
        mtl_lines.extend([f"\nnewmtl {name}",
                          f"Ka {ka:.4f} {ka:.4f} {ka:.4f}",
                          f"Kd {r:.4f} {g:.4f} {b:.4f}",
                          f"Ks {ks:.4f} {ks:.4f} {ks:.4f}",
                          f"Ns {ns:.4f}", f"d {a:.4f}"])
        return name

    def _append_entity(entity, group_name):
        model_name  = getattr(entity, 'model_name', None)
        mtl_lookup  = _parse_mtl(f) if (f := _find_model_file(model_name, '.mtl')) else {}
        obj_verts, obj_sections = _parse_obj(f) if (f := _find_model_file(model_name, '.obj')) else ([], [])

        vlines = [];  flines = []

        if len(obj_sections) > 1:
            # Multi-material: read geometry from source OBJ.
            # BAM files collapse all materials into one Geom with no name,
            # making per-part colours unrecoverable from the Panda3D scene graph.
            wm = entity.getMat(base.render)
            for x, y, z in obj_verts:
                wp = wm.xformPoint(LPoint3f(x, y, z))
                vlines.append(f"v {wp.x:.6f} {wp.y:.6f} {-wp.z:.6f}")
            base_v = v_offset[0]
            for mat_name, faces in obj_sections:
                r, g, b, a, ka, ks, ns = mtl_lookup.get(mat_name, (0.8, 0.8, 0.8, 1.0, 0.2, 0.5, 32.0))
                flines.append(f"usemtl {_register_mat(r, g, b, a, ka, ks, ns)}")
                for face in faces:
                    flines.append("f " + " ".join(str(base_v + vi) for vi in face))
            v_offset[0] += len(obj_verts)
        else:
            # Single-material or dynamic geometry (airwires): use Panda3D scene
            # graph so internal model transforms are correctly applied.
            # Color: from OBJ MTL when available, otherwise ColorAttrib/entity.color.
            color_tuple = mtl_lookup.get(obj_sections[0][0]) if obj_sections else None
            ev = 0
            for gnp in entity.findAllMatches('**/+GeomNode'):
                gn = gnp.node();  wm = gnp.getMat(base.render)
                for gi in range(gn.getNumGeoms()):
                    geom = gn.getGeom(gi)
                    if color_tuple:
                        r, g, b, a, ka, ks, ns = color_tuple
                    else:
                        state = gnp.getNetState().compose(gn.getGeomState(gi))
                        ca = state.getAttrib(ColorAttrib.getClassType())
                        if ca and ca.getColorType() == ColorAttrib.T_flat:
                            c = ca.getColor();  r, g, b, a = c.x, c.y, c.z, c.w
                        else:
                            ec = entity.color;  r, g, b, a = ec[0], ec[1], ec[2], ec[3]
                        ka, ks, ns = 0.2, 0.1, 10.0
                    flines.append(f"usemtl {_register_mat(r, g, b, a, ka, ks, ns)}")
                    try:
                        reader = GeomVertexReader(geom.getVertexData(), 'vertex')
                    except Exception:
                        continue
                    lverts = []
                    while not reader.isAtEnd():
                        pt = reader.getData3f()
                        lverts.append(wm.xformPoint(LPoint3f(pt[0], pt[1], pt[2])))
                    gvs = ev
                    for wp in lverts:
                        vlines.append(f"v {wp.x:.6f} {wp.y:.6f} {-wp.z:.6f}")
                    for pi in range(geom.getNumPrimitives()):
                        prim = geom.getPrimitive(pi).decompose()
                        for ti in range(prim.getNumPrimitives()):
                            s = prim.getPrimitiveStart(ti);  e = prim.getPrimitiveEnd(ti)
                            flines.append("f " + " ".join(
                                str(v_offset[0] + gvs + prim.getVertex(vi) + 1)
                                for vi in range(s, e)))
                    ev += len(lverts)
            v_offset[0] += ev

        if vlines:
            obj_lines.extend([f"\ng {group_name}"] + vlines + flines)

    for designator, component in dataStore.get('components', {}).items():
        _append_entity(component.footprint, designator)

    for netname, aw_dict in dataStore.get('airwires', {}).items():
        safe_net = re.sub(r'[^A-Za-z0-9_]', '_', netname)
        for key, aw in aw_dict.items():
            _append_entity(aw, f"AIRWIRE_{safe_net}_{key}")

    with open(filepath, 'w') as fh:
        fh.write('\n'.join(obj_lines) + '\n')
    with open(mtl_filepath, 'w') as fh:
        fh.write('\n'.join(mtl_lines) + '\n')
    print(f"[export] Scene written to:     {filepath}")
    print(f"[export] Materials written to: {mtl_filepath}")
