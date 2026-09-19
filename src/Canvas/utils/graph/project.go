package graph

import (
	"fmt"
	"web-app/Canvas/utils/naming"
)

// Project holds all state for one model canvas.
type Project struct {
	BaseDir          string
	NodeOrder        []string
	ID               string
	Name             string
	Nodes            map[string]Node
	Edges            map[string]Edge
	EdgeOrder        []string
	NextNodeID       int
	NextEdgeID       int
	Revision         uint64
	SemanticRevision uint64
	UndoStack        []ProjectState
	RedoStack        []ProjectState
}

// ReindexEdges purges deleted edges from EdgeOrder and clears legacy indexes.
func (p *Project) ReindexEdges() {
	var validEdges []string
	for _, eid := range p.EdgeOrder {
		if e, ok := p.Edges[eid]; ok {
			e.Index = nil
			p.Edges[eid] = e
			validEdges = append(validEdges, eid)
		}
	}
	p.EdgeOrder = validEdges
}

// GetNextNodeID finds the lowest index >= 0 for the given layer type
// such that <prefix>_<index> does not already exist in p.Nodes.
// Scoped strictly to this model workspace.
func (p *Project) GetNextNodeID(layerType string) string {
	prefix := naming.LayerTypeToPrefix(layerType)
	idx := 0
	for {
		id := fmt.Sprintf("%s_%d", prefix, idx)
		if _, exists := p.Nodes[id]; !exists {
			return id
		}
		idx++
	}
}
