package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// DataHandler returns the current project's graph data.
func DataHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	p := cur()
	data := GraphData{
		ProjectID: p.ID,
		Name:      p.Name,
		Nodes:     []Node{},
		Edges:     []Edge{},
	}
	for _, n := range p.nodes {
		data.Nodes = append(data.Nodes, n)
	}
	for _, e := range p.edges {
		data.Edges = append(data.Edges, e)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// AddNodeHandler adds a node to the active project.
func AddNodeHandler(w http.ResponseWriter, r *http.Request) {
	label := r.URL.Query().Get("label")
	if label == "" {
		label = "New Block"
	}
	layerType := r.URL.Query().Get("layerType")
	if layerType == "" {
		layerType = label
	}
	x, _ := strconv.ParseFloat(r.URL.Query().Get("x"), 64)
	y, _ := strconv.ParseFloat(r.URL.Query().Get("y"), 64)

	mu.Lock()
	defer mu.Unlock()
	p := cur()
	id := fmt.Sprintf("%d", p.nextNodeID)
	p.nextNodeID++
	n := Node{ID: id, Label: label, LayerType: layerType, Shape: "box", X: x, Y: y}
	p.nodes[id] = n

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(n)
}

// UpdateNodeReq defines payload for updating node parameters
type UpdateNodeReq struct {
	ID        string                 `json:"id"`
	Label     string                 `json:"label,omitempty"`
	LayerType string                 `json:"layerType,omitempty"`
	Params    map[string]interface{} `json:"params,omitempty"`
}

// UpdateNodeHandler updates a node's label, layerType, and parameters.
func UpdateNodeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req UpdateNodeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.ID == "" {
		http.Error(w, "missing node id", http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()
	p := cur()

	node, ok := p.nodes[req.ID]
	if !ok {
		http.Error(w, "node not found", http.StatusNotFound)
		return
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

	p.nodes[req.ID] = node
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(node)
}

// DeleteNodeHandler deletes a node and connected edges.
func DeleteNodeHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	mu.Lock()
	defer mu.Unlock()
	p := cur()
	delete(p.nodes, id)
	for k, e := range p.edges {
		if e.From == id || e.To == id {
			delete(p.edges, k)
		}
	}
	w.WriteHeader(http.StatusOK)
}

// DeleteNodesHandler batch deletes multiple nodes.
func DeleteNodesHandler(w http.ResponseWriter, r *http.Request) {
	var ids []string
	if r.Header.Get("Content-Type") == "application/json" {
		json.NewDecoder(r.Body).Decode(&ids)
	} else {
		raw := r.URL.Query().Get("ids")
		if raw != "" {
			ids = strings.Split(raw, ",")
		}
	}

	if len(ids) == 0 {
		w.WriteHeader(http.StatusOK)
		return
	}

	mu.Lock()
	defer mu.Unlock()
	p := cur()
	idSet := make(map[string]bool)
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" {
			idSet[id] = true
			delete(p.nodes, id)
		}
	}
	for k, e := range p.edges {
		if idSet[e.From] || idSet[e.To] {
			delete(p.edges, k)
		}
	}
	w.WriteHeader(http.StatusOK)
}

// MoveNodeHandler updates a node's coordinates.
func MoveNodeHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	x, errX := strconv.ParseFloat(r.URL.Query().Get("x"), 64)
	y, errY := strconv.ParseFloat(r.URL.Query().Get("y"), 64)
	if id == "" || errX != nil || errY != nil {
		http.Error(w, "invalid parameters", http.StatusBadRequest)
		return
	}
	mu.Lock()
	defer mu.Unlock()
	p := cur()
	if node, ok := p.nodes[id]; ok {
		node.X = x
		node.Y = y
		p.nodes[id] = node
		w.WriteHeader(http.StatusOK)
	} else {
		http.Error(w, "node not found", http.StatusNotFound)
	}
}

// AddEdgeHandler connects two nodes with an edge.
func AddEdgeHandler(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")

	mu.Lock()
	defer mu.Unlock()
	p := cur()

	if from == to {
		http.Error(w, "cannot connect a node to itself", http.StatusBadRequest)
		return
	}
	if _, ok := p.nodes[from]; !ok {
		http.Error(w, "from node not found", http.StatusBadRequest)
		return
	}
	if _, ok := p.nodes[to]; !ok {
		http.Error(w, "to node not found", http.StatusBadRequest)
		return
	}

	id := fmt.Sprintf("e%d", p.nextEdgeID)
	p.nextEdgeID++
	e := Edge{ID: id, From: from, To: to}
	p.edges[id] = e

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(e)
}

// DeleteEdgeHandler deletes an edge.
func DeleteEdgeHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	mu.Lock()
	defer mu.Unlock()
	delete(cur().edges, id)
	w.WriteHeader(http.StatusOK)
}

// ClearGraphHandler removes all nodes and edges from the current project.
func ClearGraphHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	p := cur()
	p.nodes = make(map[string]Node)
	p.edges = make(map[string]Edge)
	w.WriteHeader(http.StatusOK)
}
