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
    global current_entity
    if current_entity != {}:
        current_entity.color = color.rgb(255, 255, 255)
    current_entity = mouse.hovered_entity
    current_entity.color = color.rgb(150, 255, 150)

# adds Pin array and pinPos get function to Entity class
class Component(Entity):
    Pin = []
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
    
    def getPinPos(self, pinNumber):
        return self.Pin[pinNumber].world_position

# extends Component class by specific 3D model, initial position and pin positions relative to part origin
class BC547(Component):
    def __init__(self, clickFunction):
        super().__init__(model='SOT23-3', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-1.2,  1, 0), parent=self),
                    Entity(position=Vec3(-1.2, -1, 0), parent=self),
                    Entity(position=Vec3( 1.2,  0, 0), parent=self)]

# extends Component class by specific 3D model, initial position and pin positions relative to part origin
class LED5MM(Component):
    def __init__(self, clickFunction):
        super().__init__(model='LED5MM', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(12.1,  0, -6.8), parent=self),
                    Entity(position=Vec3(-12.1, 0, -6.8), parent=self)]

# extends Component class by specific 3D model, initial position and pin positions relative to part origin
class RES0603(Component):
    def __init__(self, clickFunction):
        super().__init__(model='RES0603', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0.8,  0, 0.2), parent=self),
                    Entity(position=Vec3(-0.8, 0, 0.2), parent=self)]



if __name__ == '__main__':
    app = Ursina()
    window.borderless = False
    window.exit_button.enabled = False

    current_entity = {}

    originArrows()

    LED5MM(click)
    RES0603(click)


    for i in range(-20, 20):
        for j in range(-20, 20):
            Entity(model="Cube", position=[i, j, 0], scale=0.05)
            Entity(model="Cube", position=[i, 0, j], scale=0.05)

    def input(key):
        if key == key_exit:
            app.userExit()

    EditorCamera()
    app.run()