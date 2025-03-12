from ursina import *

# placeholder for save function
def saveButtonFunction():
    print("save something")

# placeholder for load function
def loadButtonFunction():
    print("load something")

# generator that creates a grid to initially position all components
def posGenerator():
    x = 0
    y = 0
    while True:
        if x == 10:
            x = 0
            y += 1
            yield x*5, y*5, 0
        else:
            yield x*5, y*5, 0
            x += 1

# generator that returns increasing values
def counterGenerator():
    x = 0
    while True:
        yield x
        x += 1

def updateAirwires(dataStore):
    if dataStore != {}:
        nets = dataStore['nets']
        for netname in list(nets.keys()):
            for i in range(1, len(nets[netname])):
                startPart = list(nets[netname].keys())[i-1]
                startPin  = int(list(nets[netname].values())[i-1])
                endPart   = list(nets[netname].keys())[i]
                endPin    = int(list(nets[netname].values())[i])

                startPosition = dataStore['components'][startPart].getPinPos(startPin)
                endPosition = dataStore['components'][endPart].getPinPos(endPin)

                # print("net", netname, "wire", i, startPart, startPin, endPart, endPin, startPosition, endPosition)

                dataStore['airwires'][netname][str(i)].model.vertices = [startPosition, endPosition]
                dataStore['airwires'][netname][str(i)].model.generate()
    return dataStore

def deleteAllEntities(dataStore):
    if dataStore != {}:
        components = dataStore['components']
        for part in components.keys():
            destroy(components[part])

        airwires = dataStore['airwires']
        for nets in airwires.keys():
            for number in list(airwires[nets].keys()):
                destroy(airwires[nets][number])