### Constants ###

rotation_increment = 15
translation_increment = 1
airwire_thickness = 0.2

### SpaceMouse (3Dconnexion) ###

spacemouse_enabled = True
spacemouse_deadzone = 0.05          # ignore axis values below this (range 0..1)
spacemouse_pan_speed = 1.0          # camera distances per second at full deflection
spacemouse_zoom_speed = 1.5         # camera distances per second at full deflection
spacemouse_rotation_speed = 120     # degrees per second at full deflection
spacemouse_min_distance = 1         # closest the camera may zoom towards its pivot
spacemouse_button_reset_view = 1    # button index, 1 is the right button on most models
spacemouse_motion_threshold = 0.01  # axis value above which the cap counts as moving
spacemouse_scroll_block_time = 0.3  # seconds after SpaceMouse motion during which mouse wheel zoom is ignored
                                    # (the 3Dconnexion driver emits wheel events for unsupported applications)
# use a negative speed to invert an axis group

### Keybindings ###

reset_rotation = "r"

# Rotation
key_rotate_x_pos = "w"
key_rotate_x_neg = "s"
key_rotate_y_pos = "d"
key_rotate_y_neg = "a"
key_rotate_z_pos = "e"
key_rotate_z_neg = "q"

# Translation
key_translate_x_pos = "6"
key_translate_x_neg = "4"
key_translate_y_pos = "9"
key_translate_y_neg = "1"
key_translate_z_pos = "8"
key_translate_z_neg = "2"

key_swap_footprint = "f"

key_insert_wire = "w"

key_exit = "escape"