from ursina import *

app = Ursina()

# current_entity = Entity(model="cube", color=color.rgb(0, 255, 0))
current_entity = {}

def click():
    global current_entity
    if current_entity != {}:
        current_entity.color = color.rgb(200, 200, 200)
    current_entity = mouse.hovered_entity
    current_entity.color = color.rgb(255, 0, 0)

light = DirectionalLight(shadows=True)
light.look_at(Vec3(1,-1,1))

# origin arrow
x_arrow = Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(255, 0, 0), rotation = (0,   0,   0), unlit=True)
y_arrow = Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(0, 255, 0), rotation = (0,   0, -90), unlit=True)
z_arrow = Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(0, 0, 255), rotation = (0, -90,   0), unlit=True)


# devices
transistor1 = Entity(model="sot23.obj", position = ( 0,  0, 4), color = color.rgb(200,200,200), texture='', collider='mesh', on_click=click)
transistor2 = Entity(model="sot23.obj", position = (10,  0, 4), color = color.rgb(200,200,200), texture='', collider='mesh', on_click=click)
transistor3 = Entity(model="sot23.obj", position = (20,  0, 4), color = color.rgb(200,200,200), texture='', collider='mesh', on_click=click)
transistor4 = Entity(model="sot23.obj", position = ( 0, 10, 4), color = color.rgb(200,200,200), texture='', collider='mesh', on_click=click)
transistor5 = Entity(model="sot23.obj", position = ( 0, 0, 14), color = color.rgb(200,200,200), texture='', collider='mesh', on_click=click)


def input(key):
    if current_entity != {}:
        if key == "left arrow":
            current_entity.rotation_y -= 45
        if key == "right arrow":
            current_entity.rotation_y += 45
        if key == "up arrow":
            current_entity.rotation_x += 45
        if key == "down arrow":
            current_entity.rotation_x -= 45
        if key == "4":
            current_entity.x -= 1
        if key == "6":
            current_entity.x += 1
        if key == "2":
            current_entity.z -= 1
        if key == "8":
            current_entity.z += 1
        if key == "1":
            current_entity.y -= 1
        if key == "9":
            current_entity.y += 1


EditorCamera()
app.run()
