from ursina import *
from helperFunctions import *
from settings import *
from footprints import *
from math import asin, acos

# only needed for test in this file
def click():
    global currentEntity
    if currentEntity != {}:
        currentEntity.color = color.rgb(255, 255, 255)
    currentEntity = mouse.hovered_entity
    currentEntity.color = color.rgb(150, 255, 150)

class AIRWIRE(Entity):
    def __init__(self, start, end, clickFunction):
        # super().__init__(model=Mesh(vertices=[start, end], mode='line', thickness=airwire_thickness), color=color.yellow)
        midpoint = (Vec3(start) + Vec3(end)) / 2
        length = distance(start, end)
        scale = (airwire_thickness * 0.02, airwire_thickness * 0.02, length)

        super().__init__(model='Cube', position=midpoint, scale=scale, collider='mesh', color=color.yellow, on_click=clickFunction)
        # hitbox = Entity(position=Vec3(end)-Vec3(start), )


# base class for components
class Component():
    def __init__(self, current_footprint, available_footprints, designator, clickFunction):
        self.available_footprints = available_footprints
        if len(available_footprints) > int(current_footprint):
            self.current_footprint = current_footprint
        else:
            print("selected footprint out of bounds")
            self.current_footprint = 0
        self.footprint = self.available_footprints[self.current_footprint](clickFunction, designator)
        self.designator = designator

    def getPinPos(self, pinNumber):
        return self.footprint.getPinPos(pinNumber)

    value = "None"


class BC847(Component):
    def __init__(self, clickFunction, footprint=0, designator = '?'):
        super().__init__(footprint, [TO92, SOT23_3], designator, clickFunction)
        self.value = "BC847"

class LED5MM(Component):
    def __init__(self, clickFunction, footprint=0, designator = '?'):
        super().__init__(footprint, [LED5MM_A, LED5MM_B], designator, clickFunction)
        self.value = "LED5MM"

class RES(Component):
    def __init__(self, clickFunction, footprint=0, designator = '?'):
        super().__init__(footprint, [RESTHT, RESTHT_SHORT, RES0603], designator, clickFunction)
        self.value = "RES"

class CAP(Component):
    def __init__(self, clickFunction, footprint=0, designator = '?'):
        super().__init__(footprint, [CAPTHT, CAP0603], designator, clickFunction)
        self.value = "CAP"

class PORT(Component):
    def __init__(self, clickFunction, footprint=0, designator = '?'):
        super().__init__(footprint, [PIN], designator, clickFunction)
        self.value = "PORT"

class DIODETHT(Component):
    def __init__(self, clickFunction, footprint=0, designator = '?'):
        super().__init__(footprint, [DIODETHT], designator, clickFunction)
        self.name = "DIODETHT"

class BC547(Component):
    def __init__(self, clickFunction, footprint=0, designator = '?'):
        super().__init__(footprint, [TO92, SOT23_3], designator, clickFunction)
        self.name = "BC547"

class BC557(Component):
    def __init__(self, clickFunction, footprint=0, designator = '?'):
        super().__init__(footprint, [TO92, SOT23_3], designator, clickFunction)
        self.name = "BC557"

class NE555(Component):
    def __init__(self, clickFunction, footprint=0, designator = '?'):
        super().__init__(footprint, [SOIC8, DIP8], designator, clickFunction)
        self.name = "NE555"

class TL072(Component):
    def __init__(self, clickFunction, footprint=0, designator = '?'):
        super().__init__(footprint, [SOIC8, DIP8], designator, clickFunction)
        self.name = "TL072"





if __name__ == '__main__':
    app = Ursina()
    window.borderless = False
    window.exit_button.enabled = False

    currentEntity = {}

    originArrows()

    # C = CAPTHT(click)
    L = LED5MM(click)
    # T = BC547(click)
    # D = DIP8(click)
    D = SOIC8(click)
    # R = RESTHT(click)
    # PORT(click)
    AIRWIRE(start=L.getPinPos(1), end=D.getPinPos(7))
    AIRWIRE(start=L.getPinPos(2), end=D.getPinPos(6))
    AIRWIRE(start=D.getPinPos(3), end=D.getPinPos(5))
    # AIRWIRE(start=D.getPinPos(4), end=D.getPinPos(8))
    # AIRWIRE(start=C.getPinPos(2), end=T.getPinPos(2))


    for i in range(-10, 10):
        for j in range(-10, 10):
            Entity(model="Cube", position=[i*2, j*2, 0], scale=0.05)
            Entity(model="Cube", position=[i*2, 0, j*2], scale=0.05)

    def input(key):
        if key == key_exit:
            app.userExit()

    EditorCamera()
    app.run()