from ursina import *
from ursina.prefabs.file_browser import FileBrowser, FileButton

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

def updateAirwires(dataStore):
    if dataStore != {}:
        nets = dataStore['nets']
        for netname in list(nets.keys()):
            for i in range(1, len(nets[netname])):
                startPart = list(nets[netname].keys())[i-1]
                startPin  = int(list(nets[netname].values())[i-1])
                endPart   = list(nets[netname].keys())[i]
                endPin    = int(list(nets[netname].values())[i])

                startPosition = dataStore['components'][startPart].getPinPos(startPin)
                endPosition = dataStore['components'][endPart].getPinPos(endPin)

                # print("net", netname, "wire", i, startPart, startPin, endPart, endPin, startPosition, endPosition)

                dataStore['airwires'][netname][str(i)].model.vertices = [startPosition, endPosition]
                dataStore['airwires'][netname][str(i)].model.generate()
    return dataStore

def deleteAllEntities(dataStore):
    if dataStore != {}:
        components = dataStore['components']
        for part in components.keys():
            destroy(components[part])

        airwires = dataStore['airwires']
        for nets in airwires.keys():
            for number in list(airwires[nets].keys()):
                destroy(airwires[nets][number])


## Stuff I had to implement, because the Ursina Library didn't work quite right
class FileButtonBetterSave(FileButton):
    def on_click(self):
        if len([e for e in self.parent.children if e.selected]) >= self.load_menu.selection_limit and not self.selected:
            for e in self.parent.children:  # clear selection
                e.selected = False

        self.selected = True
        self.load_menu.file_name_field.text = str(self.path.name)


    def on_double_click(self):
        pass

class FileBrowserBetterSave(FileBrowser):
    def __init__(self, **kwargs):
        super().__init__(file_button_class=FileButtonBetterSave)

        self.save_button = self.open_button
        self.save_button.color = color.azure
        self.save_button.text = 'Save'
        self.save_button.on_click = self._save
        self.file_name_field = InputField(parent=self, scale_x=.75, scale_y=self.save_button.scale_y, y=self.save_button.y)
        self.save_button.y -= .075
        self.cancel_button.y -= .075
        self.file_name_field.text_field.text = ''
        self.file_type = '' # to save as

        self.last_saved_file = None     # gets set when you save a file
        self.overwrite_prompt = WindowPanel(
            content=(
                Text('Overwrite?'),
                Button('Yes', color=color.azure),
                Button('Cancel')
            ), z=-1, popup=True, enabled=False)

        for key, value in kwargs.items():
            setattr(self, key ,value)


    def file_type_setter(self, value):
        self._file_type = value
        self.file_types = (value, )
    

    def _save(self):
        file_name = self.file_name_field.text_field.text
        if file_name != "":
            if not file_name.endswith(self.file_type):
                file_name += self.file_type

            path = self.path / file_name
            # print('save:', path)
            if path.exists() and not self.overwrite_prompt.enabled:
                # print('overwrite file?')
                self.overwrite_prompt.enabled = True

            self.last_saved_file = path
            self.overwrite_prompt.enabled = False
            self.on_submit(path)
            self.close()


    def on_submit(self, path):  # implement .on_submit to handle saving
        print('save to path:', path, 'please implement .on_submit to handle saving')