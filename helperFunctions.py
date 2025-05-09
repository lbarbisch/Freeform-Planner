from ursina import *
from settings import *
from componentLibrary import *
import traceback

# draws red, green and blue arrows at origin to show X, Y and Z axis
def originArrows():
    Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(255, 0, 0), rotation = (0,   0,   0), unlit=True)
    Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(0, 255, 0), rotation = (0,   0, -90), unlit=True)
    Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(0, 0, 255), rotation = (0, -90,   0), unlit=True)


def updateAirwires(dataStore):
    if dataStore != {}:
        nets = dataStore['nets']
        for netname in list(nets.keys()):
            for i in range(1, len(nets[netname])):
                try:
                    startPart = list(nets[netname].keys())[i-1]
                    startPin  = int(list(nets[netname].values())[i-1])
                    endPart   = list(nets[netname].keys())[i]
                    endPin    = int(list(nets[netname].values())[i])

                    startPosition = dataStore['components'][startPart].getPinPos(startPin)
                    endPosition = dataStore['components'][endPart].getPinPos(endPin)

                    midpoint = (Vec3(startPosition) + Vec3(endPosition)) / 2
                    length = distance(startPosition, endPosition)
                    scale = (airwire_thickness, airwire_thickness, length)
                    
                    if not startPosition == endPosition:
                        direction = (Vec3(endPosition) - Vec3(startPosition)).normalized()
                        if not (Vec3(0, 0, 1).almostEqual(direction, 0.00101) or Vec3(0, 0, -1).almostEqual(direction, 0.00101)):   # don't do this section if the direction is close to 0, 0, 1
                            fixed_direction = Vec3(0, 0, 1)
                            rotation_quaternion = Quat()
                            rotation_quaternion.set_from_axis_angle_rad(fixed_direction.angle_rad(direction), fixed_direction.cross(direction).normalized())    #FIXME: rotation does not need to be calculated if target rotation is (0, 0, 0)
                            
                            dataStore['airwires'][netname][str(i)].quaternion = rotation_quaternion
                        else:
                            dataStore['airwires'][netname][str(i)].rotation = Vec3(0, 0, 1)
                    
                    dataStore['airwires'][netname][str(i)].position = midpoint
                    dataStore['airwires'][netname][str(i)].scale = scale
                except:
                    pass
                    print(traceback.format_exc())
                    print("airwire not possible")
                    print(dataStore)
    return dataStore

def insertWire(dataStore, clickFunction, netName, startPart, endPart):
    # create new wire Entity which is basically a normal component
    counter = 0
    while 'WIRE' + str(counter) in dataStore['components'].keys():
        counter += 1
    wireDesignator = 'WIRE' + str(counter)
    dataStore['components'][wireDesignator] = WIRE(clickFunction, 0, wireDesignator)

    endPin = dataStore['nets'][netName][endPart]
    
    # change net recipient to new wire
    dataStore['nets'][netName][wireDesignator] = dataStore['nets'][netName][endPart]
    del dataStore['nets'][netName][endPart]
    dataStore['nets'][netName][wireDesignator] = 1

    # add new net from second pin of WIRE to endPart
    counter = 0
    while 'wirenet' + str(counter) in dataStore['nets'].keys():
        counter += 1
    newNet = 'wirenet' + str(counter)
    dataStore['nets'][newNet] = {endPart: endPin, wireDesignator: 2}

    # update parameters of updated airwire object
    for x in dataStore['airwires'][netName].keys():
        if dataStore['airwires'][netName][x].endPart == endPart:
            dataStore['airwires'][netName][x].endPart = wireDesignator

    # create missing air wire for newly created net
    dataStore['airwires']['wirenet' + str(counter)] = {'1': AIRWIRE((0,0,0), (0,0,0), clickFunction, newNet, wireDesignator, endPart)}

    return dataStore

def removeWire(dataStore, designator):
    # first check if designator is even deletable
    if "WIRE" in designator:
        # getting necessary information
        wire_A_netname = dataStore['']

def swapFootprint(dataStore, currentEntity, clickFunction):
    temp_component = dataStore['components'][currentEntity.designator]
    temp_position = currentEntity.position
    temp_rotation = currentEntity.rotation
    # check if current footprint is not the last possible in the array
    if temp_component.current_footprint + 1 < len(temp_component.available_footprints):
        new_footprint = temp_component.current_footprint + 1
    else:
        new_footprint = 0
    
    destroy(currentEntity)

    temp_component.footprint = temp_component.available_footprints[new_footprint](clickFunction, temp_component.designator)

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
