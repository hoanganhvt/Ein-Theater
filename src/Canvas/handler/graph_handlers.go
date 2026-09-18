package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
	"web-app/Canvas/utils/graph"
)

// DataHandler returns the current project's graph data.
func DataHandler(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	store.Mu.Lock()
	p := store.Current()
	if id := r.URL.Query().Get("projectId"); id != "" {
		var ok bool
		p, ok = store.Projects[id]
		if !ok {
			store.Mu.Unlock()
			http.Error(w, "project not found", http.StatusNotFound)
			return
		}
	}
	snapshot := p.PrepareSnapshot()
	baseDir := p.BaseDir
	if baseDir == "" {
		baseDir = store.WorkingDir
	}
	store.Mu.Unlock()
	snapshotMS := float64(time.Since(started).Microseconds()) / 1000
	if r.URL.Query().Get("analyze") == "false" {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Server-Timing", fmt.Sprintf("snapshot;dur=%.3f", snapshotMS))
		json.NewEncoder(w).Encode(snapshot)
		return
	}
	analysisStarted := time.Now()
	analyzed, err := analyzeGraph(snapshot, baseDir)
	if err != nil {
		analyzed = snapshot
		analyzed.Nodes = append([]Node(nil), snapshot.Nodes...)
		for i := range analyzed.Nodes {
			analyzed.Nodes[i].AdaptedModel = nil
			analyzed.Nodes[i].TensorInfo = &TensorInfo{Message: "Python shape analysis unavailable: " + err.Error()}
		}
	}
	store.Mu.Lock()
	p.ApplyAnalysis(snapshot, analyzed)
	data := p.GraphSnapshot()
	store.Mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Server-Timing", fmt.Sprintf("snapshot;dur=%.3f, analysis;dur=%.3f", snapshotMS, float64(time.Since(analysisStarted).Microseconds())/1000))
	json.NewEncoder(w).Encode(data)
}

// ClearGraphHandler removes all nodes and edges from the current project.
func ClearGraphHandler(w http.ResponseWriter, r *http.Request) {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	p.Clear()

	w.WriteHeader(http.StatusOK)
}

type PasteGraphReq = graph.PasteGraphReq

type PasteGraphResp = graph.PasteGraphResp

// PasteGraphHandler duplicates nodes and internal edges into the active project,
// generating clean new 0-indexed scoped IDs, applying positional offsets,
// and preserving all layer types, hyperparameters, and orthogonal edge routes.
func PasteGraphHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req PasteGraphReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if len(req.Nodes) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(PasteGraphResp{Nodes: []Node{}, Edges: []Edge{}})
		return
	}

	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()

	result := p.Paste(req)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
