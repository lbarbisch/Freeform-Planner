from ursina import *
from ursina.prefabs.dropdown_menu import DropdownMenu, DropdownMenuButton
#from fileBrowserBetter import *
from ursina.prefabs.file_browser import *
from ursina.prefabs.file_browser_save import FileBrowserSave
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
window.entity_counter.enabled = False
window.collider_counter.enabled = False
skybox_image = load_texture("sky_sunset.jpg")
Sky(texture=skybox_image)

platform = Entity(model="cube", scale=(100, 0, 100), position=(0, -5, 0), texture='orb', color=color.dark_gray)

light = AmbientLight(shadows=True)
light.look_at(Vec3(50, -50, 50))

fb = FileBrowser(enabled=False)
fb_save = FileBrowserSave(enabled=False)
currentEntityDescriptor = Text(origin=(-.5,.5), text='nothing selected', position=(.3*window.aspect_ratio, .47+(.02*(not window.exit_button.enabled))))

currentEntity = {}
dataStore = {}
loadedFile = "no file loaded"
savedFile = "no file saved yet"

help_panel = None
help_background = None
help_text_obj = None

ec = EditorCamera()
ec.target_z = -200

originArrows()

def update_current_entity_descriptor():
    """Update the current entity descriptor text based on selected component"""
    global currentEntity, dataStore, currentEntityDescriptor
    
    if currentEntity == {}:
        currentEntityDescriptor.text = 'nothing selected'
    elif isinstance(currentEntity, AIRWIRE):
        currentEntityDescriptor.text = "Designator: " + currentEntity.designator + '\nNetname: ' + currentEntity.net + '\nPosition: ' + str(np.round(currentEntity.position, 1)) + '\nRotation: ' + str(np.round(currentEntity.rotation, 1)) + '\nFrom: ' + str(currentEntity.startPart) + '\nTo: ' + str(currentEntity.endPart)
    else:
        # For WIRE components look up the net from the dataStore; other components have no net
        net_keys = [netname for netname, parts in dataStore['nets'].items()
                    if currentEntity.designator + '__1' in parts]
        net_display = ('\nNetname: ' + net_keys[0]) if net_keys else ''
        currentEntityDescriptor.text = "Designator: " + currentEntity.designator + net_display + '\nPosition: ' + str(list(currentEntity.position)) + '\nRotation: ' + str(list(currentEntity.rotation)) + '\nFootprint: ' + str(dataStore['components'][currentEntity.designator].current_footprint+1) + '/' + str(len(dataStore['components'][currentEntity.designator].available_footprints))

def click_handler():
    """handler to select components on screen"""
    global currentEntity
    if mouse.hovered_entity:
        if currentEntity != {}:
            currentEntity.color = currentEntity.original_color
        currentEntity = mouse.hovered_entity
        currentEntity.color = color.rgb(150, 255, 150)
        update_current_entity_descriptor()
    else:
        if currentEntity != {}:
            currentEntity.color = currentEntity.original_color
        currentEntity = {}
        update_current_entity_descriptor()

def on_submit_load(paths):
    """handler which is triggered when loading a file"""
    global loadedFile, dataStore
    # save input filename for display
    loadedFile = os.fspath(paths[0])
    # parse netlist and create all components
    dataStore = loadComponents(filename=loadedFile, clickFunction=click_handler)
    # print(dataStore)

def on_submit_save(paths):
    """handler which is triggered when saving a file"""
    global savedFile, dataStore
    if type(paths) == list:
        path = paths[0]
    else:
        path = paths
    
    with open(os.fspath(path), '+bw') as file:
        file.write(makeSaveStore(dataStore))

def menuButtonLoad():
    """handler which is triggered when clicking Load button in the UI"""
    global fb
    if dataStore == {}:
        # load file, either savestate or netlist
        # fb = FileBrowser(enabled=False)
        fb.file_type = (".net", ".ffps")
        fb.on_submit = on_submit_load
        fb.title_bar.text = "Load Netlist or Project File"
        fb.enabled = True

def menuButtonSave():
    """handler which is triggered when clicking Save button in the UI"""
    global fb_save
    if dataStore != {}:
        fb_save.file_type = '.ffps'
        fb_save.on_submit = on_submit_save
        fb_save.title_bar.text = "Save Project"
        fb_save.enabled = True

def menuButtonNew():
    """handler which is triggered when clicking New button in the UI"""
    global dataStore, currentEntity, loadedFile
    # destroy all Entites individually
    dataStore = deleteAllEntities(dataStore)
    currentEntity = {}
    loadedFile = "no file loaded"
    # reset the initPosition for the part placing
    componentLibrary.initPosition = componentLibrary.posGenerator()

def close_help():
    """Close the help panel and background overlay"""
    global help_panel, help_background, help_text_obj
    
    if help_panel:
        destroy(help_panel)
        help_panel = None
    if help_text_obj:
        destroy(help_text_obj)
        help_text_obj = None
    if help_background:
        destroy(help_background)
        help_background = None

def menuButtonHelp():
    """handler which displays keyboard shortcuts help"""
    global help_panel, help_background, help_text_obj
    
    help_text = """KEYBOARD SHORTCUTS

Selection:
  Click on component - Select component
  
Rotation (selected component):
  W / S - Rotate around X axis
  D / A - Rotate around Y axis
  E / Q - Rotate around Z axis
  R - Reset rotation to (0,0,0)
  
Translation (selected component):
  6 / 4 - Move along X axis
  9 / 1 - Move along Y axis
  8 / 2 - Move along Z axis
  
Component Management:
  F - Swap footprint variant
  Ctrl+W - Insert wire (when airwire selected)
  Ctrl+W - Remove wire (when WIRE component selected)
  
Other:
  X - Print dataStore (debug)
  ESC - Exit application
  
Click anywhere to close"""
    
    # Close if already open
    if help_panel:
        close_help()
        return
    
    # Create transparent background overlay (clickable to close)
    help_background = Button(
        scale_x=window.aspect_ratio * 2,
        scale_y=2,
        color=color.rgba(0, 0, 0, 0.5),
        on_click=close_help
    )
    help_background.z = 0.1
    
    # Create help text object
    help_text_obj = Text(help_text, size=11, origin=(0, 0))
    
    # Create help panel with text
    help_panel = Panel(
        title="Keyboard Shortcuts",
        content=help_text_obj,
        popup=True
    )
    help_panel.scale = 0.7
    help_panel.z = 0.25

# basic menu structure with buttons
DropdownMenu("Menu", [DropdownMenuButton('New', on_click=menuButtonNew),
                      DropdownMenuButton('Load', on_click=menuButtonLoad),
                      DropdownMenuButton('Save', on_click=menuButtonSave),
                      DropdownMenuButton('Help', on_click=menuButtonHelp)])

def input(key):
    """Rotation and Translation of selected object"""
    global currentEntity, dataStore
    if key == 'left mouse down' and not mouse.hovered_entity and not fb.enabled and not fb_save.enabled:
        click_handler()
    if currentEntity != {} and not fb.enabled:
        if isinstance(currentEntity, AIRWIRE):

            if held_keys['left control'] and key == key_insert_wire:
                dataStore = insertWire(dataStore,
                                       click_handler,
                                       currentEntity.net,
                                       currentEntity.startPart,
                                       currentEntity.endPart)
                return

            update_current_entity_descriptor()

        else:
            # Remove WIRE component (same shortcut as insert wire, but on a WIRE component)
            if held_keys['left control'] and key == key_insert_wire and 'WIRE' in currentEntity.designator:
                dataStore = removeWire(dataStore, currentEntity.designator)
                currentEntity = {}
                update_current_entity_descriptor()
                return

            update_current_entity_descriptor()


            # reset rotation of currentEntity to 0, 0, 0 very helpful for cylindrical parts that rotate in weird ways all of a sudden
            if key == reset_rotation:
                currentEntity.rotation = (0, 0, 0)

            # Switch between available footprints
            if key == key_swap_footprint:
                dataStore, currentEntity = swapFootprint(dataStore, currentEntity, click_handler)


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

def update():
    """update positions of existing air wires"""
    global dataStore
    dataStore = updateAirwires(dataStore, click_handler)

# remenant from dependency issues
#import importlib.metadata as m; print(m.version('ursina'))

app.run()

