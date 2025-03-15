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


class BC547(Component):
    def __init__(self, clickFunction):
        super().__init__(model='SOT23-3', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-1.2,  1, 0), parent=self),
                    Entity(position=Vec3(-1.2, -1, 0), parent=self),
                    Entity(position=Vec3( 1.2,  0, 0), parent=self)]
        self.name = "BC547"

class LED5MM(Component):
    def __init__(self, clickFunction):
        super().__init__(model='LED5MM', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(12.1,  0, -6.8), parent=self),
                    Entity(position=Vec3(-12.1, 0, -6.8), parent=self)]
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
        self.name = "PORT"



if __name__ == '__main__':
    app = Ursina()
    window.borderless = False
    window.exit_button.enabled = False

    currentEntity = {}

    originArrows()

    D = DIODETHT(click)
    L = LED5MM(click)
    # PORT(click)
    # AIRWIRE(start=L.Pin[0], end=D.Pin[0])
    AIRWIRE(start=L.getPinPos(1), end=D.getPinPos(1))


    for i in range(-10, 10):
        for j in range(-10, 10):
            Entity(model="Cube", position=[i*2, j*2, 0], scale=0.05)
            Entity(model="Cube", position=[i*2, 0, j*2], scale=0.05)

    def input(key):
        if key == key_exit:
            app.userExit()

    EditorCamera()
    app.run()