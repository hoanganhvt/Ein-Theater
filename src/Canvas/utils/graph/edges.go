package graph

import (
	"errors"
	"fmt"
)

// Connect validates endpoints and creates or replaces their connection.
func (p *Project) Connect(from, to, foldMode string, customFold *float64, customLines []Line) (Edge, error) {
	if from == "" || to == "" {
		return Edge{}, errors.New("missing from or to parameter")
	}
	if from == to {
		return Edge{}, errors.New("cannot connect a node to itself")
	}
	if _, ok := p.Nodes[from]; !ok {
		return Edge{}, errors.New("from node not found")
	}
	if _, ok := p.Nodes[to]; !ok {
		return Edge{}, errors.New("to node not found")
	}
	// If an edge already exists between these nodes, update its lines rather than failing.
	for k, e := range p.Edges {
		if e.From == from && e.To == to {
			if len(customLines) > 0 {
				e.Lines = customLines
			} else {
				fn := p.Nodes[from]
				tn := p.Nodes[to]
				e.Lines = ComputeEdgeLinesWithMode(fn, tn, foldMode, customFold)
			}
			e.EdgeType = "normal"
			if foldMode != "" {
				e.FoldMode = foldMode
			}
			e.CustomFold = customFold
			p.Edges[k] = e
			p.ReindexEdges()
			return p.Edges[k], nil
		}
	}

	id := fmt.Sprintf("e%d", p.NextEdgeID)
	p.NextEdgeID++

	var lines []Line
	if len(customLines) > 0 {
		lines = customLines
	} else {
		lines = ComputeEdgeLinesWithMode(p.Nodes[from], p.Nodes[to], foldMode, customFold)
	}

	e := Edge{
		ID:         id,
		From:       from,
		To:         to,
		Lines:      lines,
		EdgeType:   "normal",
		FoldMode:   foldMode,
		CustomFold: customFold,
	}
	p.Edges[id] = e
	p.EdgeOrder = append(p.EdgeOrder, id)
	p.ReindexEdges()

	return p.Edges[id], nil
}

// UpdateEdge updates route fields and reports whether the edge exists.
func (p *Project) UpdateEdge(req UpdateEdgeReq) (Edge, bool) {
	edge, ok := p.Edges[req.ID]
	if !ok {
		return Edge{}, false
	}

	if req.Lines != nil {
		edge.Lines = req.Lines
	}
	edge.EdgeType = "normal"
	if req.FoldMode != "" {
		edge.FoldMode = req.FoldMode
	}
	if req.CustomFold != nil {
		edge.CustomFold = req.CustomFold
	}
	p.Edges[req.ID] = edge
	p.ReindexEdges()

	return p.Edges[req.ID], true
}

// UpdateEdges applies a batch of route updates, ignoring unknown edge IDs.
func (p *Project) UpdateEdges(reqs []UpdateEdgeReq) {
	for _, req := range reqs {
		if req.ID == "" {
			continue
		}
		if edge, ok := p.Edges[req.ID]; ok {
			if req.Lines != nil {
				edge.Lines = req.Lines
			}
			if req.EdgeType != "" {
				if req.EdgeType == "normal" || req.EdgeType == "data" {
					edge.EdgeType = "normal"
				} else {
					edge.EdgeType = req.EdgeType
				}
			}
			if req.FoldMode != "" {
				edge.FoldMode = req.FoldMode
			}
			if req.CustomFold != nil {
				edge.CustomFold = req.CustomFold
			}
			p.Edges[req.ID] = edge
		}
	}
	p.ReindexEdges()
}

// DeleteEdge removes an edge and updates its ordering.
func (p *Project) DeleteEdge(id string) {
	delete(p.Edges, id)
	p.ReindexEdges()
}
