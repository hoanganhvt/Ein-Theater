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
		if len(e.Lines) == 0 {
			fn, ok1 := p.nodes[e.From]
			tn, ok2 := p.nodes[e.To]
			if ok1 && ok2 {
				e.Lines = ComputeEdgeLines(fn, tn)
				p.edges[e.ID] = e
			}
		}
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
	ID         string                 `json:"id"`
	Label      string                 `json:"label,omitempty"`
	LayerType  string                 `json:"layerType,omitempty"`
	Params     map[string]interface{} `json:"params,omitempty"`
	Parent     *string                `json:"parent,omitempty"`
	ParentZone *string                `json:"parentZone,omitempty"`
}

// UpdateNodeHandler updates a node's label, layerType, parameters, and parent.
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
	
	if req.Parent != nil {
	    node.Parent = *req.Parent
	}
	if req.ParentZone != nil {
	    node.ParentZone = *req.ParentZone
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
		// Update straight line segments for all edges connected to this node while preserving user folds
		for k, e := range p.edges {
			if e.From == id || e.To == id {
				if len(e.Lines) == 0 {
					fn, ok1 := p.nodes[e.From]
					tn, ok2 := p.nodes[e.To]
					if ok1 && ok2 {
						e.Lines = ComputeEdgeLines(fn, tn)
						p.edges[k] = e
					}
				} else {
					if e.From == id {
						e.Lines[0].First = Point{X: x, Y: y}
						e.Lines[0].From = Point{X: x, Y: y}
					}
					if e.To == id {
						lastIdx := len(e.Lines) - 1
						e.Lines[lastIdx].Last = Point{X: x, Y: y}
						e.Lines[lastIdx].To = Point{X: x, Y: y}
					}
					p.edges[k] = e
				}
			}
		}
		w.WriteHeader(http.StatusOK)
	} else {
		http.Error(w, "node not found", http.StatusNotFound)
	}
}

// AddEdgeReq defines payload for adding an edge with optional custom straight lines.
type AddEdgeReq struct {
	From  string `json:"from"`
	To    string `json:"to"`
	Lines []Line `json:"lines"`
}

// AddEdgeHandler connects two nodes with an edge.
func AddEdgeHandler(w http.ResponseWriter, r *http.Request) {
	var from, to string
	var customLines []Line

	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var req AddEdgeReq
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			from = req.From
			to = req.To
			customLines = req.Lines
		}
	}

	if from == "" {
		from = r.URL.Query().Get("from")
	}
	if to == "" {
		to = r.URL.Query().Get("to")
	}

	mu.Lock()
	defer mu.Unlock()
	p := cur()

	if from == "" || to == "" {
		http.Error(w, "missing from or to parameter", http.StatusBadRequest)
		return
	}
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
	// If an edge already exists between these nodes, update its lines rather than failing.
	for k, e := range p.edges {
		if e.From == from && e.To == to {
			if len(customLines) > 0 {
				e.Lines = customLines
			} else {
				fn := p.nodes[from]
				tn := p.nodes[to]
				e.Lines = ComputeEdgeLines(fn, tn)
			}
			p.edges[k] = e
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(e)
			return
		}
	}

	id := fmt.Sprintf("e%d", p.nextEdgeID)
	p.nextEdgeID++

	var lines []Line
	if len(customLines) > 0 {
		lines = customLines
	} else {
		lines = ComputeEdgeLines(p.nodes[from], p.nodes[to])
	}

	e := Edge{ID: id, From: from, To: to, Lines: lines}
	p.edges[id] = e

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(e)
}

// UpdateEdgeReq defines the payload for updating an edge's custom lines/folds.
type UpdateEdgeReq struct {
	ID       string `json:"id"`
	Lines    []Line `json:"lines"`
	EdgeType string `json:"edgeType,omitempty"`
}

// UpdateEdgeHandler updates an edge's custom straight lines (user-decided folds).
func UpdateEdgeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req UpdateEdgeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.ID == "" {
		http.Error(w, "missing edge id", http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()
	p := cur()

	edge, ok := p.edges[req.ID]
	if !ok {
		http.Error(w, "edge not found", http.StatusNotFound)
		return
	}

	if req.Lines != nil {
		edge.Lines = req.Lines
	}
	if req.EdgeType != "" {
		edge.EdgeType = req.EdgeType
	} else if req.EdgeType == "data" {
	    edge.EdgeType = ""
	}
	p.edges[req.ID] = edge

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(edge)
}

// DeleteEdgeHandler deletes an edge.
func DeleteEdgeHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("edge deletedddd\n\n")
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
