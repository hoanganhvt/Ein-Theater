package graph

import (
	"fmt"
	"path/filepath"
	"strings"
	"web-app/Canvas/utils/naming"
)

// ImportGraph restores a saved graph, reusing an empty or same-name project.
func (s *Store) ImportGraph(graphData GraphData, cleanFolder string) *Project {
	modelName := graphData.Name
	var p *Project
	active := s.Current()
	if active != nil && len(active.Nodes) == 0 && (active.Name == "Untitled Model" || active.Name == modelName) {
		p = active
		p.Name = modelName
	} else {
		for _, proj := range s.Projects {
			if proj.Name == modelName {
				p = proj
				s.CurrentProjectID = p.ID
				break
			}
		}
		if p == nil {
			p = s.MakeProject(modelName)
			s.Projects[p.ID] = p
			s.ProjectOrder = append(s.ProjectOrder, p.ID)
			s.CurrentProjectID = p.ID
		}
	}

	p.Nodes = make(map[string]Node)
	p.Edges = make(map[string]Edge)
	p.BaseDir, _ = filepath.Abs(cleanFolder)
	p.NodeOrder = nil

	for _, n := range graphData.Nodes {
		ResolveModelPaths(&n, p.BaseDir)
		p.NodeOrder = append(p.NodeOrder, n.ID)
		if n.Label == "" {
			if strings.Contains(n.ID, "_") {
				n.Label = strings.ReplaceAll(n.ID, "_", " ")
			} else {
				prefix := naming.LayerTypeToPrefix(n.LayerType)
				if n.ID != "" {
					n.Label = fmt.Sprintf("%s %s", prefix, n.ID)
				} else {
					n.Label = prefix
				}
			}
		}
		p.Nodes[n.ID] = n
	}

	p.EdgeOrder = make([]string, 0)
	for _, e := range graphData.Edges {
		if len(e.Lines) == 0 {
			fn, ok1 := p.Nodes[e.From]
			tn, ok2 := p.Nodes[e.To]
			if ok1 && ok2 {
				e.Lines = ComputeEdgeLines(fn, tn)
			}
		}
		p.Edges[e.ID] = e
		p.EdgeOrder = append(p.EdgeOrder, e.ID)
	}
	p.ReindexEdges()

	p.NextEdgeID = len(p.Edges)
	p.ResetHistory()

	return p
}
