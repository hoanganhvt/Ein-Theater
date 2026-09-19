package handler

import (
	"encoding/json"
	"net/http"
	"sync"
	"web-app/Canvas/utils/graph"
)

// Serializes commands that span multiple Store.Mu acquisitions (legacy handlers)
// with history changes. Python analysis is intentionally outside this mutex.
var editMu sync.Mutex

func recorded(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		editMu.Lock()
		defer editMu.Unlock()
		store.Mu.Lock()
		p := store.Current()
		before := p.State()
		store.Mu.Unlock()
		next(w, r)
		store.Mu.Lock()
		p.RecordEdit(before)
		store.Mu.Unlock()
	}
}

func HistoryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	editMu.Lock()
	defer editMu.Unlock()
	store.Mu.Lock()
	defer store.Mu.Unlock()
	id := r.URL.Query().Get("projectId")
	if id == "" {
		id = store.CurrentProjectID
	}
	p, ok := store.Projects[id]
	if !ok {
		http.Error(w, "project not found", http.StatusNotFound)
		return
	}
	if r.Method == http.MethodPost {
		if id != store.CurrentProjectID {
			http.Error(w, "active project changed", http.StatusConflict)
			return
		}
		var changed bool
		switch r.URL.Path {
		case "/api/history/undo", "/history/undo":
			changed = p.Undo()
		case "/api/history/redo", "/history/redo":
			changed = p.Redo()
		default:
			http.Error(w, "unknown history command", http.StatusNotFound)
			return
		}
		if !changed {
			http.Error(w, "history is empty", http.StatusConflict)
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		Graph    graph.GraphData `json:"graph"`
		CanUndo  bool            `json:"canUndo"`
		CanRedo  bool            `json:"canRedo"`
		Revision uint64          `json:"revision"`
	}{p.GraphSnapshot(), len(p.UndoStack) > 0, len(p.RedoStack) > 0, p.Revision})
}

// DragSelectionHandler commits node positions and wire routes as one edit.
func DragSelectionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	var req struct {
		ProjectID string                `json:"projectId"`
		Nodes     []graph.MoveNodeItem  `json:"nodes"`
		Edges     []graph.UpdateEdgeReq `json:"edges"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", 400)
		return
	}
	editMu.Lock()
	defer editMu.Unlock()
	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	if req.ProjectID != "" && req.ProjectID != p.ID {
		http.Error(w, "project changed", 409)
		return
	}
	for _, n := range req.Nodes {
		if _, ok := p.Nodes[n.ID]; !ok {
			http.Error(w, "node not found", 404)
			return
		}
	}
	for _, e := range req.Edges {
		if _, ok := p.Edges[e.ID]; !ok {
			http.Error(w, "edge not found", 404)
			return
		}
	}
	before := p.State()
	p.MoveNodes(req.Nodes)
	p.UpdateEdges(req.Edges)
	p.RecordEdit(before)
	w.WriteHeader(http.StatusOK)
}

// DeleteSelectionHandler removes nodes, their incident edges, and explicit edges in one step.
func DeleteSelectionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	var req struct {
		ProjectID string   `json:"projectId"`
		Nodes     []string `json:"nodes"`
		Edges     []string `json:"edges"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", 400)
		return
	}
	editMu.Lock()
	defer editMu.Unlock()
	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	if req.ProjectID != "" && req.ProjectID != p.ID {
		http.Error(w, "project changed", 409)
		return
	}
	for _, id := range req.Nodes {
		if _, ok := p.Nodes[id]; !ok {
			http.Error(w, "node not found", 404)
			return
		}
	}
	for _, id := range req.Edges {
		if _, ok := p.Edges[id]; !ok {
			http.Error(w, "edge not found", 404)
			return
		}
	}
	before := p.State()
	p.DeleteNodes(req.Nodes)
	for _, id := range req.Edges {
		p.DeleteEdge(id)
	}
	p.RecordEdit(before)
	w.WriteHeader(http.StatusOK)
}
