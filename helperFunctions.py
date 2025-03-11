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