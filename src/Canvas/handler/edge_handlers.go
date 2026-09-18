package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"web-app/Canvas/utils/graph"
)

type AddEdgeReq = graph.AddEdgeReq

// AddEdgeHandler connects two nodes with an edge.
func AddEdgeHandler(w http.ResponseWriter, r *http.Request) {
	var from, to, foldMode, edgeType string
	var customFold *float64
	var customLines []Line

	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var req AddEdgeReq
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			from = req.From
			to = req.To
			customLines = req.Lines
			edgeType = req.EdgeType
			foldMode = req.FoldMode
			customFold = req.CustomFold
		}
	}

	if from == "" {
		from = r.URL.Query().Get("from")
	}
	if to == "" {
		to = r.URL.Query().Get("to")
	}
	if edgeType == "" {
		edgeType = r.URL.Query().Get("edgeType")
		if edgeType == "" {
			edgeType = r.URL.Query().Get("type")
		}
	}
	if foldMode == "" {
		foldMode = r.URL.Query().Get("foldMode")
	}

	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()

	edge, err := p.Connect(from, to, foldMode, customFold, customLines)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(edge)
}

type UpdateEdgeReq = graph.UpdateEdgeReq

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

	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()

	edge, ok := p.UpdateEdge(req)
	if !ok {
		http.Error(w, "edge not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(edge)
}

// UpdateEdgesHandler batch updates multiple edges' lines.
func UpdateEdgesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var reqs []UpdateEdgeReq
	if err := json.NewDecoder(r.Body).Decode(&reqs); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	p.UpdateEdges(reqs)

	w.WriteHeader(http.StatusOK)
}

// DeleteEdgeHandler deletes an edge.
func DeleteEdgeHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	p.DeleteEdge(id)

	w.WriteHeader(http.StatusOK)
}
