package graph

// Clear removes all graph contents and resets scoped counters.
func (p *Project) Clear() {
	p.Nodes = make(map[string]Node)
	p.Edges = make(map[string]Edge)
	p.EdgeOrder = make([]string, 0)
	p.NextNodeID = 0
	p.NextEdgeID = 0
}

// PrepareSnapshot fills missing routes and returns an isolated graph snapshot.
func (p *Project) PrepareSnapshot() GraphData {
	p.ReindexEdges()
	for _, eid := range p.EdgeOrder {
		if e, ok := p.Edges[eid]; ok {
			if len(e.Lines) == 0 {
				fn, ok1 := p.Nodes[e.From]
				tn, ok2 := p.Nodes[e.To]
				if ok1 && ok2 {
					e.Lines = ComputeEdgeLinesWithMode(fn, tn, e.FoldMode, e.CustomFold)
					p.Edges[e.ID] = e
				}
			}
		}
	}
	return p.GraphSnapshot()
}
