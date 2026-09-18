package graph

import (
	"strings"
)

// AddNode creates a node with a scoped ID and default display label.
func (p *Project) AddNode(label, layerType, shape string, x, y float64, params map[string]interface{}) Node {
	id := p.GetNextNodeID(layerType)
	displayName := strings.ReplaceAll(id, "_", " ")
	finalLabel := displayName
	if label != "" && label != "New Block" && label != layerType {
		finalLabel = label
	}
	n := Node{ID: id, Label: finalLabel, LayerType: layerType, Shape: shape, X: x, Y: y, Params: params}
	p.Nodes[id] = n

	return n
}

// UpdateNode applies the optional fields and reports whether the node exists.
func (p *Project) UpdateNode(req UpdateNodeReq) (Node, bool) {
	node, ok := p.Nodes[req.ID]
	if !ok {
		return Node{}, false
	}

	if req.Label != "" {
		node.Label = req.Label
	}
	if req.LayerType != "" {
		node.LayerType = req.LayerType
	}
	if req.Params != nil {
		node.Params = req.Params
	}

	if req.Parent != nil {
		node.Parent = *req.Parent
	}
	if req.ParentZone != nil {
		node.ParentZone = *req.ParentZone
	}

	p.Nodes[req.ID] = node
	return node, true
}

// DeleteNode removes one node and all incident edges.
func (p *Project) DeleteNode(id string) {
	delete(p.Nodes, id)
	for k, e := range p.Edges {
		if e.From == id || e.To == id {
			delete(p.Edges, k)
		}
	}
	p.ReindexEdges()
}

// DeleteNodes removes the requested nodes and all incident edges.
func (p *Project) DeleteNodes(ids []string) {
	idSet := make(map[string]bool)
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" {
			idSet[id] = true
			delete(p.Nodes, id)
		}
	}
	for k, e := range p.Edges {
		if idSet[e.From] || idSet[e.To] {
			delete(p.Edges, k)
		}
	}
	p.ReindexEdges()
}

// MoveNode changes coordinates and optionally adjusts connected routes.
func (p *Project) MoveNode(id string, x, y float64, updateEdges bool) bool {
	if node, ok := p.Nodes[id]; ok {
		node.X = x
		node.Y = y
		p.Nodes[id] = node
		// Update straight line segments for all edges connected to this node while preserving user folds
		if updateEdges {
			for k, e := range p.Edges {
				if e.From == id || e.To == id {
					fn, ok1 := p.Nodes[e.From]
					tn, ok2 := p.Nodes[e.To]
					if ok1 && ok2 {
						if len(e.Lines) <= 3 {
							e.Lines = ComputeEdgeLinesWithMode(fn, tn, e.FoldMode, e.CustomFold)
						} else {
							if e.From == id && len(e.Lines) > 0 {
								e.Lines[0].First = Point{X: x, Y: y}
								e.Lines[0].From = Point{X: x, Y: y}
							}
							if e.To == id && len(e.Lines) > 0 {
								lastIdx := len(e.Lines) - 1
								e.Lines[lastIdx].Last = Point{X: x, Y: y}
								e.Lines[lastIdx].To = Point{X: x, Y: y}
							}
						}
						p.Edges[k] = e
					}
				}
			}
		}
		return true
	} else {
		return false
	}
}

// MoveNodes applies a batch of positions without changing edge routes.
func (p *Project) MoveNodes(items []MoveNodeItem) {
	for _, item := range items {
		if node, ok := p.Nodes[item.ID]; ok {
			node.X = item.X
			node.Y = item.Y
			p.Nodes[item.ID] = node
		}
	}
}
