from ursina import *
from settings import *

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


class WIRE10X10(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='WIRE10X10', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0, 0, 0), parent=self),
                    Entity(position=Vec3(-10, 0, -10), parent=self)]

class WIRE10X20(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='WIRE10X20', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0, 0, 0), parent=self),
                    Entity(position=Vec3(-20, 0, -10), parent=self)]

class WIRE20X10(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='WIRE20X10', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0, 0, 0), parent=self),
                    Entity(position=Vec3(-10, 0, -20), parent=self)]

class WIRE20X50(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='WIRE20X50', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0, 0, 0), parent=self),
                    Entity(position=Vec3(-50, 0, -20), parent=self)]

class WIRE50X20(Footprint):
    # -
    def __init__(self, clickFunction, designator):
        super().__init__(designator, model='WIRE50X20', collider='mesh', position=next(initPosition), on_click=clickFunction)
        self.Pin = [Entity(position=Vec3(0, 0, 0), parent=self),
                    Entity(position=Vec3(-20, 0, -50), parent=self)]




if __name__ == '__main__':
    app = Ursina()
    window.borderless = False
    window.exit_button.enabled = False

    currentEntity = {}

    originArrows()

    WIRE10X20(click, "test")


    for i in range(-10, 10):
        for j in range(-10, 10):
            Entity(model="Cube", position=[i, j, 0], scale=0.05)
            Entity(model="Cube", position=[i, 0, j], scale=0.05)

    def input(key):
        if key == key_exit:
            app.userExit()

    EditorCamera()
    app.run()