package handler

import (
	"errors"
	"path/filepath"
	"web-app/Canvas/utils/graph"
)

var ErrCompiledProjectExists = errors.New("compiled project already exists")

// ImportCompiledGraph atomically adopts a validated Code-mode graph.
func ImportCompiledGraph(sourcePath string, data graph.GraphData, replace bool) (string, bool, error) {
	if len(data.Nodes) == 0 || data.Name == "" {
		return "", false, errors.New("compiled graph is empty")
	}
	ids := make(map[string]bool, len(data.Nodes))
	for _, node := range data.Nodes {
		if node.ID == "" || node.LayerType == "" || ids[node.ID] {
			return "", false, errors.New("compiled graph has invalid nodes")
		}
		ids[node.ID] = true
	}
	for _, edge := range data.Edges {
		if !ids[edge.From] || !ids[edge.To] || edge.From == edge.To {
			return "", false, errors.New("compiled graph has invalid edges")
		}
	}
	store.Mu.Lock()
	defer store.Mu.Unlock()
	var p *graph.Project
	for _, id := range store.ProjectOrder {
		if candidate := store.Projects[id]; candidate != nil && (candidate.SourcePath == sourcePath || candidate.CodePath == sourcePath) {
			p = candidate
			break
		}
	}
	updated := p != nil
	if updated && !replace && (p.SourcePath == sourcePath || len(p.Nodes) > 0 || len(p.Edges) > 0) {
		return p.ID, true, ErrCompiledProjectExists
	}
	if p == nil {
		p = store.CreateProject(data.Name)
	}
	p.Name = data.Name
	p.SourcePath = sourcePath
	p.CodePath = sourcePath
	p.BaseDir = filepath.Dir(sourcePath)
	p.Nodes = make(map[string]graph.Node, len(data.Nodes))
	p.Edges = make(map[string]graph.Edge, len(data.Edges))
	p.NodeOrder = nil
	p.EdgeOrder = nil
	for _, node := range data.Nodes {
		p.Nodes[node.ID] = node
		p.NodeOrder = append(p.NodeOrder, node.ID)
	}
	for _, edge := range data.Edges {
		p.Edges[edge.ID] = edge
		p.EdgeOrder = append(p.EdgeOrder, edge.ID)
	}
	p.NextNodeID = len(data.Nodes)
	p.NextEdgeID = len(data.Edges)
	p.ResetHistory()
	store.CurrentProjectID = p.ID
	return p.ID, updated, nil
}

func CompiledProject(sourcePath string) string {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	for _, id := range store.ProjectOrder {
		if p := store.Projects[id]; p != nil && p.SourcePath == sourcePath {
			return id
		}
	}
	return ""
}

func WorkspaceDir() string {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	return store.WorkingDir
}
