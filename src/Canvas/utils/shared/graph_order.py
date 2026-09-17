"""Stable ordering of canvas edges by numeric edge ID."""

def ordered_edges(edges):
    def key(pair):
        pos, edge = pair
        eid = str(edge.get('id', ''))
        return (int(eid[1:]) if eid.startswith('e') and eid[1:].isdigit() else pos, pos)
    return [edge for _, edge in sorted(enumerate(edges), key=key)]
