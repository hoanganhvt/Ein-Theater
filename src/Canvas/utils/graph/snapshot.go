package graph

import (
	"encoding/json"
	"path/filepath"
	"sort"
)

// OrderedNodes returns stored node order followed by remaining IDs sorted lexically.
func (p *Project) OrderedNodes() []Node {
	result := []Node{}
	seen := map[string]bool{}
	for _, id := range p.NodeOrder {
		if n, ok := p.Nodes[id]; ok && !seen[id] {
			result = append(result, n)
			seen[id] = true
		}
	}
	ids := []string{}
	for id := range p.Nodes {
		if !seen[id] {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	for _, id := range ids {
		result = append(result, p.Nodes[id])
	}
	return result
}

// GraphSnapshot detaches maps and nested metadata through JSON serialization.
// Callers sharing the project hold Store.Mu; Python runs after releasing it.
func (p *Project) GraphSnapshot() GraphData {
	edges := []Edge{}
	seen := map[string]bool{}
	for _, id := range p.EdgeOrder {
		if e, ok := p.Edges[id]; ok && !seen[id] {
			edges = append(edges, e)
			seen[id] = true
		}
	}
	ids := []string{}
	for id := range p.Edges {
		if !seen[id] {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	for _, id := range ids {
		edges = append(edges, p.Edges[id])
	}
	data := GraphData{ProjectID: p.ID, Name: p.Name, Nodes: p.OrderedNodes(), Edges: edges}
	raw, _ := json.Marshal(data)
	var snapshot GraphData
	_ = json.Unmarshal(raw, &snapshot)
	return snapshot
}

// MatchesSnapshot compares semantic inputs while ignoring layout-only edits.
func (p *Project) MatchesSnapshot(snapshot GraphData) bool {
	before, _ := json.Marshal(shapeInputs(snapshot))
	current, _ := json.Marshal(shapeInputs(p.GraphSnapshot()))
	return string(before) == string(current)
}

// Position and wire-route edits do not change tensor semantics. Inference now
// runs while the user moves blocks; do not discard its result just for a drag.
// ApplyAnalysis writes only metadata, so the current layout remains untouched.
func shapeInputs(graph GraphData) GraphData {
	graph.Nodes = append([]Node(nil), graph.Nodes...)
	graph.Edges = append([]Edge(nil), graph.Edges...)
	for i := range graph.Nodes {
		graph.Nodes[i].X = 0
		graph.Nodes[i].Y = 0
	}
	for i := range graph.Edges {
		graph.Edges[i].Lines = nil
		graph.Edges[i].FoldMode = ""
		graph.Edges[i].CustomFold = nil
	}
	return graph
}

// ApplyAnalysis adopts metadata only when the original semantic inputs still match.
func (p *Project) ApplyAnalysis(snapshot, analyzed GraphData) bool {
	if !p.MatchesSnapshot(snapshot) {
		return false
	}
	for _, node := range analyzed.Nodes {
		if existing, ok := p.Nodes[node.ID]; ok {
			existing.Params = node.Params
			existing.TensorInfo = node.TensorInfo
			existing.AdaptedModel = node.AdaptedModel
			p.Nodes[node.ID] = existing
		}
	}
	return true
}

// ResolveModelPaths resolves relative model and weight references against base.
func ResolveModelPaths(n *Node, base string) {
	for _, key := range []string{"model_path", "weights_path"} {
		path, ok := n.Params[key].(string)
		if ok && path != "" && !filepath.IsAbs(path) {
			n.Params[key] = filepath.Clean(filepath.Join(base, path))
		}
	}
}

// AdoptSavedIntegrations adopts saved references without overwriting newer edits.
func (p *Project) AdoptSavedIntegrations(snapshot, saved GraphData, folder string) bool {
	for i := range saved.Nodes {
		ResolveModelPaths(&saved.Nodes[i], folder)
	}
	if !p.ApplyAnalysis(snapshot, saved) {
		return false
	}
	p.BaseDir = folder
	return true
}
