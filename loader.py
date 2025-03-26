import parts
import re
import pickle
import traceback

def parseKicadNetlist(file_path):
    components = {}
    connections = {}

    with open(file_path, "r", encoding="utf-8") as file:
        content = file.read()

    # Extract components
    comp_pattern = re.findall(r'\(comp \(ref "([^"]+)"\).*?\(value "([^"]+)"\)', content, re.DOTALL)
    for ref, value in comp_pattern:
        components[ref] = value

    # Extract connections
    net_pattern = re.findall(r'(\(net \(code "[^"]+"\) \(name "[^"]+"\)(.|\n)*?\)\)\)(?!(net )))', content, re.DOTALL)
    for net_groups in net_pattern:
        if len(net_groups) > 1:
            net_groups = net_groups[0]
        netname   = re.findall(r'\(name "([^"]+)', net_groups)
        net_nodes = re.findall(r'\(node \(ref "([^"]+)"\) \(pin "([^"]+)"\)', net_groups)
        connections[netname[0]] = {}
        for designator, pinnumber in net_nodes:
            connections[netname[0]][designator] = pinnumber

    return components, connections

# main loading function
def loadComponents(filename, clickFunction={}):
    # detect fileending if it is a netlist or a save file
    if filename[-5:] == ".ffps":
        return _loadProjectFile(filename, clickFunction)
    elif filename[-4:] == ".net":
        return _loadNetlist(filename, clickFunction)

# parses and loads a project file
def _loadProjectFile(filename, clickFunction):
    # first read in the file and unpickle it
    loadStore = {}
    with open(filename, "br") as file:
        loadStore = pickle.load(file)
    
    # print("loadStore", loadStore)

    components = loadStore['components']
    dataStore = {}
    # instantiate all components from their respective class and add them to the components subdict
    dataStore["components"] = {}
    for designator in list(components.keys()):
        try:
            componentClass = getattr(parts, components[designator]['value'])
            footprint = components[designator]['footprint']
            dataStore["components"][designator] = componentClass(clickFunction, footprint, designator)     # add the actual component
            dataStore["components"][designator].footprint.rotation = components[designator]['rotation']
            dataStore["components"][designator].footprint.position = components[designator]['position']
        except:
            print(traceback.format_exc())
            print("No component candidate found for", components[designator]['value'], "skipping")
    
    # print('dataStore', dataStore)
    # add all nets to the nets subdict
    dataStore['nets'] = {}
    connections = loadStore['nets']
    for netname in list(connections.keys()):
        nets = connections[netname]
        if "unconnected" not in netname:
            dataStore['nets'][netname] = nets
    
    # add airwires
    # print(connections)
    dataStore['airwires'] = {}
    # iterate over every netname
    for netname in list(connections.keys()):
        if "unconnected" not in netname:
            # prepare 
            dataStore['airwires'][netname] = {}
            # print(netname)
            for i in range(1, len(connections[netname])):
                try:
                    startPart = list(connections[netname].keys())[i-1]
                    startPin  = int(list(connections[netname].values())[i-1])
                    endPart   = list(connections[netname].keys())[i]
                    endPin    = int(list(connections[netname].values())[i])

                    startPosition = dataStore['components'][startPart].getPinPos(startPin)
                    endPosition   = dataStore['components'][endPart].getPinPos(endPin)

                    # print("net", netname, "wire", i, startPart, startPin, endPart, endPin, startPosition, endPosition)

                    if clickFunction != {}:
                        dataStore['airwires'][netname][str(i)] = parts.AIRWIRE(startPosition, endPosition, clickFunction, netname, startPart, endPart)
                    else:
                        dataStore['airwires'][netname][str(i)] = "wire" + str(i)
                except:
                    print(traceback.format_exc())
                    print("skipping Airwire, because part does not exist.")

    return dataStore

# parses and loads netlists
def _loadNetlist(filename, clickFunction={}, dataStore={}):
    # first get all components and connections from the netlist
    components, connections = parseKicadNetlist(filename)

    # instantiate all components from their respective class and add them to the components subdict
    dataStore["components"] = {}
    for designator in list(components.keys()):
        try:
            componentClass = getattr(parts, components[designator])
            
            if clickFunction != {}:
                dataStore["components"][designator] = componentClass(clickFunction, 0, designator)     # add the actual component
            else:
                dataStore["components"][str(designator)] = components[designator]       # only add name for testing purposes
        except:
            print(traceback.format_exc())
            print("No component candidate found for", components[designator], "skipping")
    
    # add all nets to the nets subdict
    dataStore['nets'] = {}
    for netname in list(connections.keys()):
        nets = connections[netname]
        if "unconnected" not in netname:
            dataStore['nets'][netname] = nets
    
    # add airwires
    # print(connections)
    dataStore['airwires'] = {}
    validDesignators = dataStore['components'].keys()
    # iterate over every netname
    for netname in list(connections.keys()):
        if "unconnected" not in netname:
            # prepare 
            dataStore['airwires'][netname] = {}
            # print(netname)
            for i in range(1, len(connections[netname])):
                try:
                    startPart = list(connections[netname].keys())[i-1]
                    startPin  = int(list(connections[netname].values())[i-1])
                    endPart   = list(connections[netname].keys())[i]
                    endPin    = int(list(connections[netname].values())[i])

                    startPosition = dataStore['components'][startPart].getPinPos(startPin)
                    endPosition = dataStore['components'][endPart].getPinPos(endPin)
                # print("net", netname, "wire", i, startPart, startPin, endPart, endPin, startPosition, endPosition)

                    if clickFunction != {}:
                        dataStore['airwires'][netname][str(i)] = parts.AIRWIRE(startPosition, endPosition, clickFunction, netname, startPart, endPart)
                    else:
                        dataStore['airwires'][netname][str(i)] = "wire" + str(i)
                except:
                    print(traceback.format_exc())
                    print("skipping Airwire, because part does not exist.")
            if dataStore['airwires'][netname] == {}:
                del(dataStore['airwires'][netname])
    return dataStore

def makeSaveStore(dataStore, debug=1):
    saveStore = {}
    saveStore["components"]= {}
    saveStore['nets'] = dataStore['nets']

    for designatorName in dataStore['components'].keys():
        designatorObject = dataStore['components'][designatorName]
        saveStore['components'][designatorName] = {'value': designatorObject.value, 'rotation': designatorObject.footprint.rotation, 'position': designatorObject.footprint.position, 'footprint': designatorObject.current_footprint}

    if debug:
        print("saveStore", saveStore)
    
    return pickle.dumps(saveStore, protocol=pickle.HIGHEST_PROTOCOL)


if __name__ == "__main__":
    dataStore = _loadNetlist("transistor_oscillator.net")
    
    print(dataStore)

    with open("testoutput.ffps", 'wb') as file:
        file.write(makeSaveStore(dataStore, debug=1))