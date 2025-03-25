from parts import *
from helperFunctions import *
from settings import *


initPosition = posGenerator()
counter = counterGenerator()

# only needed for test in this file
def click():
    global currentEntity
    if currentEntity != {}:
        currentEntity.color = color.rgb(255, 255, 255)
    currentEntity = mouse.hovered_entity
    currentEntity.color = color.rgb(150, 255, 150)
    print(currentEntity.designator)



class Footprint(Entity):
    Pin = []
    
    def __init__(self, designator, **kwargs):
        super().__init__(**kwargs)
        self.designator = designator
    
    def getPinPos(self, pinNumber):
        # pinNumber-1 so pin number 1 is index 0
        return self.Pin[pinNumber-1].world_position


class DIODETHT(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='DIODETHT', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0.8,  0, 0.2), parent=self),
                    Entity(position=Vec3(-0.8, 0, 0.2), parent=self)]

class CAP0603(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='CAP0603', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0.8,  0, 0.2), parent=self),
                    Entity(position=Vec3(-0.8, 0, 0.2), parent=self)]

class CAPTHT(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='CAPTHT', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(12.5,  0, 0), parent=self),
                    Entity(position=Vec3(-12.5, 0, 0), parent=self)]

class RES0603(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='RES0603', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0.8,  0, 0.2), parent=self),
                    Entity(position=Vec3(-0.8, 0, 0.2), parent=self)]

class RESTHT(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='RESTHT', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3( 31, 0, 0), parent=self),
                    Entity(position=Vec3(-31, 0, 0), parent=self)]

class RESTHT_SHORT(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='RESTHT_SHORT', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3( 7.5, 0, 0), parent=self),
                    Entity(position=Vec3(-7.5, 0, 0), parent=self)]

class LED5MM_A(Footprint):
    #              ┌─────┐ 
    #             ┌       ┐ 
    #             │       │   
    #             │       │   
    #             │ A   K │   
    #             └─┬───┬─┘ 
    #               │   │
    # 1 ────────────┘   └──────────── 2
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='LED5MM', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(12.1,  0, 0), parent=self),
                    Entity(position=Vec3(-12.1, 0, 0), parent=self)]

class LED5MM_B(Footprint):
    #       ┌─────┐ 
    #      ┌       ┐ 
    #      │       │ 
    #      │       │ 
    #      │ A   K │ 
    #      └─┬───┬─┘ 
    #        │   │   
    #        1   2
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='LED5MM_SHORT', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(1.3,  0, 0), parent=self),
                    Entity(position=Vec3(-1.3, 0, 0), parent=self)]

class SOT23_3(Footprint):
    #           +---+        
    #           |   |        
    #           | 2 |        
    #  +--------+---+-------+
    #  |                    |
    #  |                    |
    #  |                    |
    #  |                    |
    #  ++---+----------+---++
    #   |   |          |   | 
    #   | 1 |          | 3 | 
    #   +---+          +---+ 
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='SOT23-3', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-1.2,  1, 0), parent=self),
                    Entity(position=Vec3(-1.2, -1, 0), parent=self),
                    Entity(position=Vec3( 1.2,  0, 0), parent=self)]

class TO92(Footprint):
    #  ┌┬───────┬┐
    #  ││       ││
    #  ││       ││
    #  ││       ││
    #  └┴─┬─┬─┬─┴┘
    #     │ │ │   
    #  ┌──┘ │ └──┐
    #  │    │    │
    #  │    │    │
    #  1    2    3
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='TO92', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3( 2.4, -12, 0), parent=self),
                    Entity(position=Vec3(   0, -12, 0), parent=self),
                    Entity(position=Vec3(-2.4, -12, 0), parent=self)]

class SOIC8(Footprint):
    #  Same as in every datasheet
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='SOIC8', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-1.905, 0, -3), parent=self),
                    Entity(position=Vec3(-0.635, 0, -3), parent=self),
                    Entity(position=Vec3( 0.635, 0, -3), parent=self),
                    Entity(position=Vec3( 1.905, 0, -3), parent=self),
                    Entity(position=Vec3( 1.905, 0,  3), parent=self),
                    Entity(position=Vec3( 0.635, 0,  3), parent=self),
                    Entity(position=Vec3(-0.635, 0,  3), parent=self),
                    Entity(position=Vec3(-1.905, 0,  3), parent=self)]

class DIP8(Footprint):
    #  Same as in every datasheet
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='DIP8', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(-3.81, -3.81, -3.81), parent=self),
                    Entity(position=Vec3(-1.27, -3.81, -3.81), parent=self),
                    Entity(position=Vec3( 1.27, -3.81, -3.81), parent=self),
                    Entity(position=Vec3( 3.81, -3.81, -3.81), parent=self),
                    Entity(position=Vec3( 3.81, -3.81, 3.81), parent=self),
                    Entity(position=Vec3( 1.27, -3.81, 3.81), parent=self),
                    Entity(position=Vec3(-1.27, -3.81, 3.81), parent=self),
                    Entity(position=Vec3(-3.81, -3.81, 3.81), parent=self)]

class PIN(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='PIN', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0, 0, 0), parent=self)]



if __name__ == '__main__':
    app = Ursina()
    window.borderless = False
    window.exit_button.enabled = False

    currentEntity = {}

    originArrows()

    SOIC8(click, "test")


    for i in range(-10, 10):
        for j in range(-10, 10):
            Entity(model="Cube", position=[i, j, 0], scale=0.05)
            Entity(model="Cube", position=[i, 0, j], scale=0.05)

    def input(key):
        if key == key_exit:
            app.userExit()

    EditorCamera()
    app.run()