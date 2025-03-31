from ursina import *
from ursina.prefabs.dropdown_menu import DropdownMenu, DropdownMenuButton
from fileBrowserBetter import *
from componentLibrary import *
from loader import *
from helperFunctions import *
from settings import *
import numpy as np
import pprint
import os

app = Ursina(title="Freeform-Planner", borderless=False, development_mode=True, fullscreen=False, show_ursina_splash=False, splash=False)
window.exit_button.enabled = False
window.fps_counter.enabled = False
skybox_image = load_texture("sky_sunset.jpg")
Sky(texture=skybox_image)

platform = Entity(model="cube", scale=(100, 0, 100), position=(0, -5, 0), texture='orb', color=color.dark_gray)

light = AmbientLight(shadows=True)
light.look_at(Vec3(50, -50, 50))

fb = FileBrowserBetterSave(enabled=False)
currentEntityDescriptor = Text(origin=(-.5,.5), text='nothing selected', position=(.3*window.aspect_ratio, .47+(.02*(not window.exit_button.enabled))))

currentEntity = {}
dataStore = {}
loadedFile = "no file loaded"
savedFile = "no file saved yet"

originArrows()

# handler to select components on screen
def click():
    global currentEntity
    if currentEntity != {}:
        currentEntity.color = color.rgb(255, 255, 255)
    if isinstance(currentEntity, AIRWIRE):
        currentEntity.color = color.yellow
    currentEntity = mouse.hovered_entity
    currentEntity.color = color.rgb(150, 255, 150)

def on_submit_load(paths):
    global loadedFile, dataStore
    # save input filename for display
    loadedFile = os.fspath(paths[0])
    # parse netlist and create all components
    dataStore = loadComponents(filename=loadedFile, clickFunction=click)
    # print(dataStore)

def on_submit_save(paths):
    global savedFile, dataStore
    if type(paths) == list:
        path = paths[0]
    else:
        path = paths
    
    with open(os.fspath(path), '+bw') as file:
        file.write(makeSaveStore(dataStore))


def menuButtonLoad():
    global fb
    if dataStore == {}:
        # load file, either savestate or netlist
        # fb = FileBrowser(enabled=False)
        fb.file_type = (".net", ".ffps")
        fb.on_submit = on_submit_load
        fb.title_bar.text = "Load Netlist or Project File"
        fb.enabled = True

def menuButtonSave():
    global fb
    if dataStore != {}:
        fb.file_type = '.ffps'
        fb.on_submit = on_submit_save
        fb.title_bar.text = "Save Project"
        fb.enabled = True
        print("done")

def menuButtonNew():
    global dataStore, currentEntity, loadedFile
    # destroy all Entites individually
    dataStore = deleteAllEntities(dataStore)
    currentEntity = {}
    loadedFile = "no file loaded"
    # reset the initPosition for the part placing
    componentLibrary.initPosition = componentLibrary.posGenerator()


# basic menu structure with buttons
DropdownMenu("Menu", [DropdownMenuButton('New', on_click=menuButtonNew),
                      DropdownMenuButton('Load', on_click=menuButtonLoad),
                      DropdownMenuButton('Save', on_click=menuButtonSave)])


# print("dataStore", dataStore)

# Rotation and Translation of selected object
def input(key):
    global currentEntity, dataStore
    if currentEntity != {} and fb.enabled == False:
        if isinstance(currentEntity, AIRWIRE):

            if held_keys['left control'] and key == key_insert_wire:
                dataStore = insertWire(dataStore, click, currentEntity.net, currentEntity.startPart, currentEntity.endPart)
                return

            currentEntityDescriptor.text = "Designator: " + currentEntity.designator + '\nNetname: ' + currentEntity.net + '\nPosition: ' + str(np.round(currentEntity.position, 1)) + '\nRotation: ' + str(np.round(currentEntity.rotation, 1)) + '\nFrom: ' + str(currentEntity.startPart) + '\nTo: ' + str(currentEntity.endPart)

        else:
            
            currentEntityDescriptor.text = "Designator: " + currentEntity.designator + '\nPosition: ' + str(list(currentEntity.position)) + '\nRotation: ' + str(list(currentEntity.rotation)) + '\nFootprint: ' + str(dataStore['components'][currentEntity.designator].current_footprint+1) + '/' + str(len(dataStore['components'][currentEntity.designator].available_footprints))


            # reset rotation of currentEntity to 0, 0, 0 very helpfull for cylindrical parts that rotate in weird ways all of a sudden
            if key == reset_rotation:
                currentEntity.rotation = (0, 0, 0)

            # Switch between available footprints
            if key == key_swap_footprint:
                dataStore, currentEntity = swapFootprint(dataStore, currentEntity, click)
            

            # Rotate around X axis
            if key == key_rotate_x_pos:
                currentEntity.rotation_x += rotation_increment
            elif held_keys[key_rotate_x_pos]:
                currentEntity.rotation_x += rotation_increment
            if key == key_rotate_x_neg:
                currentEntity.rotation_x -= rotation_increment
            elif held_keys[key_rotate_x_neg]:
                currentEntity.rotation_x -= rotation_increment

            # Rotate around Y axis
            if key == key_rotate_y_pos:
                currentEntity.rotation_y += rotation_increment
            elif held_keys[key_rotate_y_pos]:
                currentEntity.rotation_y += rotation_increment
            if key == key_rotate_y_neg:
                currentEntity.rotation_y -= rotation_increment
            elif held_keys[key_rotate_y_neg]:
                currentEntity.rotation_y -= rotation_increment

            # Rotate around Z axis
            if key == key_rotate_z_pos:
                currentEntity.rotation_z += rotation_increment
            elif held_keys[key_rotate_z_pos]:
                currentEntity.rotation_z += rotation_increment
            if key == key_rotate_z_neg:
                currentEntity.rotation_z -= rotation_increment
            elif held_keys[key_rotate_z_neg]:
                currentEntity.rotation_z -= rotation_increment

            # Translate on X axis
            if key == key_translate_x_pos:
                currentEntity.x += translation_increment/2
            elif held_keys[key_translate_x_pos]:
                currentEntity.x += translation_increment
            if key == key_translate_x_neg:
                currentEntity.x -= translation_increment/2
            elif held_keys[key_translate_x_neg]:
                currentEntity.x -= translation_increment

            # Translate on Y axis
            if key == key_translate_y_pos:
                currentEntity.y += translation_increment/2
            elif held_keys[key_translate_y_pos]:
                currentEntity.y += translation_increment
            if key == key_translate_y_neg:
                currentEntity.y -= translation_increment/2
            elif held_keys[key_translate_y_neg]:
                currentEntity.y -= translation_increment

            # Translate on Z axis
            if key == key_translate_z_pos:
                currentEntity.z += translation_increment/2
            elif held_keys[key_translate_z_pos]:
                currentEntity.z += translation_increment
            if key == key_translate_z_neg:
                currentEntity.z -= translation_increment/2
            elif held_keys[key_translate_z_neg]:
                currentEntity.z -= translation_increment
            
    if key == 'x':                              #### ONLY USED FOR DEBUGGING ####
        pp = pprint.PrettyPrinter(indent=2)
        pp.pprint(dataStore)
    if key == key_exit:                         #### ONLY NEEDED FOR DEBUGGING ####
        app.userExit()

# update positions of existing air wires
def update():
    global dataStore
    dataStore = updateAirwires(dataStore)
    # net1.model.vertices=[Q2.getPinPos(0), Q3.getPinPos(1)]
    # net1.model.generate()
    # net2.model.vertices=[Q1.getPinPos(2), Q2.getPinPos(1)]
    # net2.model.generate()


EditorCamera(target_z=-100)

app.run()
