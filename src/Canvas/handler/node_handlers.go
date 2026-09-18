package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"web-app/Canvas/utils/graph"
)

type AddNodeReq = graph.AddNodeReq

// AddNodeHandler adds a node to the active project.
func AddNodeHandler(w http.ResponseWriter, r *http.Request) {
	var label, layerType, shape string
	var x, y float64
	var params map[string]interface{}

	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var req AddNodeReq
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			label = req.Label
			layerType = req.LayerType
			x = req.X
			y = req.Y
			params = req.Params
			shape = req.Shape
		}
	}

	if label == "" {
		label = r.URL.Query().Get("label")
	}
	if label == "" {
		label = "New Block"
	}
	if layerType == "" {
		layerType = r.URL.Query().Get("layerType")
	}
	if layerType == "" {
		layerType = label
	}
	if x == 0 && y == 0 {
		x, _ = strconv.ParseFloat(r.URL.Query().Get("x"), 64)
		y, _ = strconv.ParseFloat(r.URL.Query().Get("y"), 64)
	}
	if shape == "" {
		shape = "box"
	}

	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	n := p.AddNode(label, layerType, shape, x, y, params)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(n)
}

type UpdateNodeReq = graph.UpdateNodeReq

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

	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()

	node, ok := p.UpdateNode(req)
	if !ok {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(node)
}

// DeleteNodeHandler deletes a node and connected edges.
func DeleteNodeHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	p.DeleteNode(id)

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

	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	p.DeleteNodes(ids)

	w.WriteHeader(http.StatusOK)
}

type MoveNodeItem = graph.MoveNodeItem

// MoveNodeHandler updates a node's coordinates.
func MoveNodeHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	x, errX := strconv.ParseFloat(r.URL.Query().Get("x"), 64)
	y, errY := strconv.ParseFloat(r.URL.Query().Get("y"), 64)
	if id == "" || errX != nil || errY != nil {
		http.Error(w, "invalid parameters", http.StatusBadRequest)
		return
	}
	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	if p.MoveNode(id, x, y, r.URL.Query().Get("update_edges") != "false") {
		w.WriteHeader(http.StatusOK)
	} else {
		http.Error(w, "node not found", http.StatusNotFound)
	}
}

// MoveNodesHandler batch updates multiple nodes' coordinates without mutating edge lines.
func MoveNodesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var items []MoveNodeItem
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	p.MoveNodes(items)

	w.WriteHeader(http.StatusOK)
}
