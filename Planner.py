from ursina import *
from ursina.prefabs.dropdown_menu import DropdownMenu, DropdownMenuButton
from ursina.prefabs.file_browser import *
from Parts import *
from settings import *

app = Ursina()
window.borderless = False
window.exit_button.enabled = False

light = AmbientLight(shadows=True)
light.look_at(Vec3(50, -50, 50))


current_entity = {}

# handler to select components on screen
def click():
    global current_entity
    if current_entity != {}:
        current_entity.color = color.rgb(255, 255, 255)
    current_entity = mouse.hovered_entity
    current_entity.color = color.rgb(150, 255, 150)


originArrows()

# load file, either savestate or netlist
FileBrowser()

# basic menu structure with buttons
DropdownMenu("test", [DropdownMenuButton('New'),
                      DropdownMenuButton('Load', on_click=loadButtonFunction),
                      DropdownMenuButton('Save', on_click=saveButtonFunction)])


# add all components, in future according to a parsed netlist
Q1 = BC547(click)
Q2 = BC547(click)
Q3 = BC547(click)
V1 = LED5MM(click)
R1 = RES0603(click)
R2 = RES0603(click)
R3 = RES0603(click)

# define air wire  placeholders
net1 = Entity(model=Mesh(vertices=[(0,0,0), (0,0,0)], mode='line', thickness=5), color=color.yellow)
net2 = Entity(model=Mesh(vertices=[(0,0,0), (0,0,0)], mode='line', thickness=5), color=color.yellow)

# Rotation and Translation of selected object
def input(key):
    if current_entity != {}:
        if key == key_rotate_y_pos:
            current_entity.rotation_y += rotation_increment
        elif held_keys[key_rotate_y_pos]:
            current_entity.rotation_y += rotation_increment
        if key == key_rotate_y_neg:
            current_entity.rotation_y -= rotation_increment
        elif held_keys[key_rotate_y_neg]:
            current_entity.rotation_y -= rotation_increment

        if key == key_rotate_x_pos:
            current_entity.rotation_x += rotation_increment
        elif held_keys[key_rotate_x_pos]:
            current_entity.rotation_x += rotation_increment
        if key == key_rotate_x_neg:
            current_entity.rotation_x -= rotation_increment
        elif held_keys[key_rotate_x_neg]:
            current_entity.rotation_x -= rotation_increment

        if key == key_rotate_z_pos:
            current_entity.rotation_z += rotation_increment
        elif held_keys[key_rotate_z_pos]:
            current_entity.rotation_z += rotation_increment
        if key == key_rotate_z_neg:
            current_entity.rotation_z -= rotation_increment
        elif held_keys[key_rotate_z_neg]:
            current_entity.rotation_z -= rotation_increment

        if key == key_translate_x_pos:
            current_entity.x += translation_increment/2
        elif held_keys[key_translate_x_pos]:
            current_entity.x += translation_increment
        if key == key_translate_x_neg:
            current_entity.x -= translation_increment/2
        elif held_keys[key_translate_x_neg]:
            current_entity.x -= translation_increment

        if key == key_translate_z_pos:
            current_entity.z += translation_increment/2
        elif held_keys[key_translate_z_pos]:
            current_entity.z += translation_increment
        if key == key_translate_z_neg:
            current_entity.z -= translation_increment/2
        elif held_keys[key_translate_z_neg]:
            current_entity.z -= translation_increment

        if key == key_translate_y_pos:
            current_entity.y += translation_increment/2
        elif held_keys[key_translate_y_pos]:
            current_entity.y += translation_increment
        if key == key_translate_y_neg:
            current_entity.y -= translation_increment/2
        elif held_keys[key_translate_y_neg]:
            current_entity.y -= translation_increment

    if key == key_exit:
        app.userExit()

# update positions of existing air wires
def update():
    net1.model.vertices=[Q2.getPinPos(0), Q3.getPinPos(1)]
    net1.model.generate()
    net2.model.vertices=[Q1.getPinPos(2), Q2.getPinPos(1)]
    net2.model.generate()


EditorCamera()
app.run()
