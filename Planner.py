from ursina import *
from Parts import *

app = Ursina()
window.borderless = False
window.exit_button.enabled = False


# current_entity = Entity(model="cube", color=color.rgb(0, 255, 0))
current_entity = {}

def click():
    global current_entity
    if current_entity != {}:
        current_entity.color = color.rgb(200, 200, 200)
    current_entity = mouse.hovered_entity
    current_entity.color = color.rgb(255, 0, 0)

light = DirectionalLight(shadows=True)
light.look_at(Vec3(50, -50, 50))

# origin arrow
x_arrow = Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(255, 0, 0), rotation = (0,   0,   0), unlit=True)
y_arrow = Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(0, 255, 0), rotation = (0,   0, -90), unlit=True)
z_arrow = Entity(model="arrow", scale=(2, 1, 1), origin=(-0.5, 0, 0), color = color.rgb(0, 0, 255), rotation = (0, -90,   0), unlit=True)


Q1 = BC547(click)
Q2 = BC547(click)
Q3 = BC547(click)

net1 = Entity(model=Mesh(vertices=[Q2.Pin[0]+Q2.position, Q3.Pin[1]+Q3.position], mode='line', thickness=4), color=color.yellow)
net2 = Entity(model=Mesh(vertices=[Q1.Pin[2]+Q1.position, Q2.Pin[1]+Q2.position], mode='line', thickness=4), color=color.yellow)


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

def update():
    net1.model.vertices=[Q2.Pin[0]+Q2.position, Q3.Pin[1]+Q3.position]
    net1.model.generate()
    net2.model.vertices=[Q1.Pin[2]+Q1.position, Q2.Pin[1]+Q2.position]
    net2.model.generate()


EditorCamera()
app.run()
