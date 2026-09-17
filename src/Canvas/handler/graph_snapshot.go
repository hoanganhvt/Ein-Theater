package handler

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
)

// Canvas serialization and saved-reference handling only. All tensor analysis,
// graph execution and recursive model adaptation belong to Python.
func (p *Project) orderedNodes() []Node {
	result := []Node{}
	seen := map[string]bool{}
	for _, id := range p.nodeOrder {
		if n, ok := p.nodes[id]; ok && !seen[id] {
			result = append(result, n)
			seen[id] = true
		}
	}
	ids := []string{}
	for id := range p.nodes {
		if !seen[id] {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	for _, id := range ids {
		result = append(result, p.nodes[id])
	}
	return result
}

// Detach maps and nested metadata before handing a snapshot to another process.
// Caller holds mu; Python runs after releasing it.
func (p *Project) graphSnapshot() GraphData {
	edges := []Edge{}
	seen := map[string]bool{}
	for _, id := range p.edgeOrder {
		if e, ok := p.edges[id]; ok && !seen[id] {
			edges = append(edges, e)
			seen[id] = true
		}
	}
	ids := []string{}
	for id := range p.edges {
		if !seen[id] {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	for _, id := range ids {
		edges = append(edges, p.edges[id])
	}
	data := GraphData{ProjectID: p.ID, Name: p.Name, Nodes: p.orderedNodes(), Edges: edges}
	raw, _ := json.Marshal(data)
	var snapshot GraphData
	_ = json.Unmarshal(raw, &snapshot)
	return snapshot
}

func (p *Project) matchesSnapshot(snapshot GraphData) bool {
	before, _ := json.Marshal(snapshot)
	current, _ := json.Marshal(p.graphSnapshot())
	return string(before) == string(current)
}

func (p *Project) applyAnalysis(snapshot, analyzed GraphData) bool {
	if !p.matchesSnapshot(snapshot) {
		return false
	}
	for _, node := range analyzed.Nodes {
		if existing, ok := p.nodes[node.ID]; ok {
			existing.Params = node.Params
			existing.TensorInfo = node.TensorInfo
			existing.AdaptedModel = node.AdaptedModel
			p.nodes[node.ID] = existing
		}
	}
	return true
}

func resolveModelPaths(n *Node, base string) {
	for _, key := range []string{"model_path", "weights_path"} {
		path, ok := n.Params[key].(string)
		if ok && path != "" && !filepath.IsAbs(path) {
			n.Params[key] = filepath.Clean(filepath.Join(base, path))
		}
	}
}

func readModelCanvas(folder string) (GraphData, error) {
	var graph GraphData
	name := filepath.Base(folder)
	data, err := os.ReadFile(filepath.Join(folder, name+".json"))
	if err != nil {
		return graph, err
	}
	var wrapper map[string]json.RawMessage
	if err = json.Unmarshal(data, &wrapper); err != nil {
		return graph, err
	}
	if canvas, ok := wrapper["canvas"]; ok {
		data = canvas
	}
	err = json.Unmarshal(data, &graph)
	return graph, err
}

func (p *Project) adoptSavedIntegrations(snapshot, saved GraphData, folder string) bool {
	for i := range saved.Nodes {
		resolveModelPaths(&saved.Nodes[i], folder)
	}
	if !p.applyAnalysis(snapshot, saved) {
		return false
	}
	p.baseDir = folder
	return true
}
