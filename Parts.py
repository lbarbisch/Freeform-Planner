from ursina import *

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

def counterGenerator():
    x = 0
    while True:
        yield x
        x += 1

initPosition = posGenerator()
counter = counterGenerator()

def BC547(fin):
    temp = Entity(model="SOT23-3", collider='mesh', position=next(initPosition), on_click=fin)
    # temp = Entity(model="SOT23-3", collider='mesh', on_click=fin)
    # add xyz positions for pin 1 to 3
    temp.Pin = [Vec3(-1.2,  1, 0), Vec3(-1.2, -1, 0), Vec3( 1.2, 0, 0)]
    return temp

if __name__ == '__main__':
    for i in range(0,50):
        print(next(initPosition))
