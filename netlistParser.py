# generated with chatGPT

import re

def parse_kicad_netlist_improved(file_path):
    components = {}
    connections = []

    with open(file_path, "r", encoding="utf-8") as file:
        content = file.read()

    # Extract components
    comp_pattern = re.findall(r'\(comp \(ref "([^"]+)"\).*?\(value "([^"]+)"\)', content, re.DOTALL)
    for ref, value in comp_pattern:
        components[ref] = value

    # Extract connections with improved regex
    net_pattern = re.findall(r'\(net \(code "[^"]+"\) \(name "([^"]+)"\)([\s\S]*?)\)\s*\)', content)
    for net_name, nodes in net_pattern:
        node_pattern = re.findall(r'\(node \(ref "([^"]+)"\) \(pin "([^"]+)"', nodes)
        if node_pattern:
            connections.append((net_name, node_pattern))

    return components, connections

file_path = "test.net"

# Parse the file again with an improved regex for node extraction
components, connections = parse_kicad_netlist_improved(file_path)

# Show a sample of extracted components and connections
components_sample = dict(list(components.items())[:10])
connections_sample = connections[:10]

print(components_sample, connections_sample)
