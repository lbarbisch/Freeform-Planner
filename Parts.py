from ursina import *
from helperFunctions import *
from settings import *

initPosition = posGenerator()
counter = counterGenerator()

# draws red, green and blue arrows at origin to show X, Y and Z axis
def originArrows():
    Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(255, 0, 0), rotation = (0,   0,   0), unlit=True)
    Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(0, 255, 0), rotation = (0,   0, -90), unlit=True)
    Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(0, 0, 255), rotation = (0, -90,   0), unlit=True)

# only needed for test in this file
def click():
    global currentEntity
    if currentEntity != {}:
        currentEntity.color = color.rgb(255, 255, 255)
    currentEntity = mouse.hovered_entity
    currentEntity.color = color.rgb(150, 255, 150)

# adds Pin array and pinPos get function to Entity class
class Component(Entity):
    Pin = []
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
    
    def getPinPos(self, pinNumber):
        # pinNumber-1 so pin number 1 is index 0
        return self.Pin[pinNumber-1].world_position

class AIRWIRE(Entity):
    def __init__(self, start, end):
        super().__init__(model=Mesh(vertices=[start, end], mode='line', thickness=airwire_thickness), color=color.yellow)


class BC847(Component):
    def __init__(self, clickFunction):
        super().__init__(model='SOT23-3', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-1.2,  1, 0), parent=self),
                    Entity(position=Vec3(-1.2, -1, 0), parent=self),
                    Entity(position=Vec3( 1.2,  0, 0), parent=self)]
        self.name = "BC847"

class LED5MM(Component):
    def __init__(self, clickFunction):
        super().__init__(model='LED5MM', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(12.1,  0, 0), parent=self),
                    Entity(position=Vec3(-12.1, 0, 0), parent=self)]
        self.name = "LED5MM"

class RES0603(Component):
    def __init__(self, clickFunction):
        super().__init__(model='RES0603', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0.8,  0, 0.2), parent=self),
                    Entity(position=Vec3(-0.8, 0, 0.2), parent=self)]
        self.name = "RES0603"

class PORT(Component):
    def __init__(self, clickFunction):
        super().__init__(model='PIN', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0, 0, 0), parent=self)]
        self.name = "PORT"

class DIODETHT(Component):
    def __init__(self, clickFunction):
        super().__init__(model='1N4007', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(22.5,  0, 0), parent=self),
                    Entity(position=Vec3(-22.5, 0, 0), parent=self)]
        self.name = "DIODETHT"

class RESTHT(Component):
    def __init__(self, clickFunction):
        super().__init__(model='RESTHT', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3( 31, 0, 0), parent=self),
                    Entity(position=Vec3(-31, 0, 0), parent=self)]
        self.name = "RESTHT"

class RESTHT_SHORT(Component):
    def __init__(self, clickFunction):
        super().__init__(model='RESTHT_SHORT', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3( 7.5, 0, 0), parent=self),
                    Entity(position=Vec3(-7.5, 0, 0), parent=self)]
        self.name = "RESTHT_SHORT"

class BC547(Component):
    def __init__(self, clickFunction):
        super().__init__(model='TO92', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3( 2.4, -12, 0), parent=self),
                    Entity(position=Vec3(   0, -12, 0), parent=self),
                    Entity(position=Vec3(-2.4, -12, 0), parent=self)]
        self.name = "BC547"

class BC557(Component):
    def __init__(self, clickFunction):
        super().__init__(model='TO92', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3( 2.4, -12, 0), parent=self),
                    Entity(position=Vec3(   0, -12, 0), parent=self),
                    Entity(position=Vec3(-2.4, -12, 0), parent=self)]
        self.name = "BC557"

class CAPTHT(Component):
    def __init__(self, clickFunction):
        super().__init__(model='CAPTHT', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(12.5,  0, 0), parent=self),
                    Entity(position=Vec3(-12.5, 0, 0), parent=self)]
        self.name = "CAPTHT"

class CAP0603(Component):
    def __init__(self, clickFunction):
        super().__init__(model='CAP0603', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0.8,  0, 0.2), parent=self),
                    Entity(position=Vec3(-0.8, 0, 0.2), parent=self)]
        self.name = "CAP0603"

class DIP8(Component):
    def __init__(self, clickFunction):
        super().__init__(model='DIP8', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-3.81, -3.81, -3.81), parent=self),
                    Entity(position=Vec3(-1.27, -3.81, -3.81), parent=self),
                    Entity(position=Vec3( 1.27, -3.81, -3.81), parent=self),
                    Entity(position=Vec3( 3.81, -3.81, -3.81), parent=self),
                    Entity(position=Vec3( 3.81, -3.81, 3.81), parent=self),
                    Entity(position=Vec3( 1.27, -3.81, 3.81), parent=self),
                    Entity(position=Vec3(-1.27, -3.81, 3.81), parent=self),
                    Entity(position=Vec3(-3.81, -3.81, 3.81), parent=self)]
        self.name = "DIP8"

class DIP8_NE555P(Component):
    def __init__(self, clickFunction):
        super().__init__(model='DIP8', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-3.81, -3.81, -3.81), parent=self),
                    Entity(position=Vec3(-1.27, -3.81, -3.81), parent=self),
                    Entity(position=Vec3( 1.27, -3.81, -3.81), parent=self),
                    Entity(position=Vec3( 3.81, -3.81, -3.81), parent=self),
                    Entity(position=Vec3( 3.81, -3.81, 3.81), parent=self),
                    Entity(position=Vec3( 1.27, -3.81, 3.81), parent=self),
                    Entity(position=Vec3(-1.27, -3.81, 3.81), parent=self),
                    Entity(position=Vec3(-3.81, -3.81, 3.81), parent=self)]
        self.name = "DIP8_NE555P"

class SOIC8(Component):
    def __init__(self, clickFunction):
        super().__init__(model='SOIC8', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-1.905, 0, -3), parent=self),
                    Entity(position=Vec3(-0.635, 0, -3), parent=self),
                    Entity(position=Vec3( 0.635, 0, -3), parent=self),
                    Entity(position=Vec3( 1.905, 0, -3), parent=self),
                    Entity(position=Vec3( 1.905, 0,  3), parent=self),
                    Entity(position=Vec3( 0.635, 0,  3), parent=self),
                    Entity(position=Vec3(-0.635, 0,  3), parent=self),
                    Entity(position=Vec3(-1.905, 0,  3), parent=self)]
        self.name = "SOIC8"

class SOIC8_NE555D(Component):
    def __init__(self, clickFunction):
        super().__init__(model='SOIC8', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-1.905, 0, -3), parent=self),
                    Entity(position=Vec3(-0.635, 0, -3), parent=self),
                    Entity(position=Vec3( 0.635, 0, -3), parent=self),
                    Entity(position=Vec3( 1.905, 0, -3), parent=self),
                    Entity(position=Vec3( 1.905, 0,  3), parent=self),
                    Entity(position=Vec3( 0.635, 0,  3), parent=self),
                    Entity(position=Vec3(-0.635, 0,  3), parent=self),
                    Entity(position=Vec3(-1.905, 0,  3), parent=self)]
        self.name = "SOIC8_NE555D"

class SOIC8_TL072(Component):
    def __init__(self, clickFunction):
        super().__init__(model='SOIC8', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-1.905, 0, -3), parent=self),
                    Entity(position=Vec3(-0.635, 0, -3), parent=self),
                    Entity(position=Vec3( 0.635, 0, -3), parent=self),
                    Entity(position=Vec3( 1.905, 0, -3), parent=self),
                    Entity(position=Vec3( 1.905, 0,  3), parent=self),
                    Entity(position=Vec3( 0.635, 0,  3), parent=self),
                    Entity(position=Vec3(-0.635, 0,  3), parent=self),
                    Entity(position=Vec3(-1.905, 0,  3), parent=self)]
        self.name = "SOIC8_TL072"




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
    AIRWIRE(start=D.getPinPos(4), end=D.getPinPos(8))
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