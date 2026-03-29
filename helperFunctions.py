from ursina import *
from settings import *
from componentLibrary import *
import traceback

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
        # Keys may be plain component designators, or use the WIRE0__2 convention
        # (designator + '__' + pin_number) to allow a single component to appear
        # twice in one net dict without a key collision.
        pin_list = sorted(nets[netname].items(), key=lambda x: x[0])
        pins = []
        key_to_index = {}  # net-key -> index in pins
        for key, pin in pin_list:
            if '__' in key:
                part, encoded_pin = key.rsplit('__', 1)
                pin_number = int(encoded_pin)
            else:
                part = key
                pin_number = int(pin)
            pos = dataStore['components'][part].getPinPos(pin_number)
            key_to_index[key] = len(pins)
            pins.append((part, pin_number, pos))

        # Identify WIRE pin pairs: entries sharing the same DESIGNATOR via __1 / __2
        # keys.  Each such pair is already physically connected – treat them as
        # pre-connected edges so Kruskal doesn't draw an airwire for them.
        wire_designators = set()
        for key in key_to_index:
            if '__' in key:
                designator, _ = key.rsplit('__', 1)
                wire_designators.add(designator)

        preconnected = []
        for designator in wire_designators:
            k1 = designator + '__1'
            k2 = designator + '__2'
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
