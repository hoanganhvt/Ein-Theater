package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"web-app/Canvas/utils/modelio"
	"web-app/Canvas/utils/naming"
	"web-app/Canvas/utils/python"
)

// SaveModelHandler serializes the current project, invokes Canvas/utils/generate code/gen_code.py to generate code,
// and saves <model_name>/<model_name>.json and <model_name>/<model_name>.py.
func SaveModelHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProjectID string `json:"projectId"`
		Dir       string `json:"dir"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if req.ProjectID == "" {
		req.ProjectID = r.URL.Query().Get("projectId")
	}
	if req.Dir == "" {
		req.Dir = r.URL.Query().Get("dir")
	}

	store.Mu.Lock()
	targetDir := req.Dir
	if targetDir == "" {
		targetDir = store.WorkingDir
	}

	p := store.Current()
	if req.ProjectID != "" {
		if found, ok := store.Projects[req.ProjectID]; ok {
			p = found
		}
	}

	if p == nil {
		store.Mu.Unlock()
		http.Error(w, "No active project found", http.StatusBadRequest)
		return
	}

	if !naming.IsValidModelFolderName(p.Name) {
		p.Name = naming.FixModelName(p.Name)
	}

	// Python performs fresh graph adaptation and validation before generation.
	p.ReindexEdges()
	graphPayload := p.GraphSnapshot()
	baseDir := p.BaseDir
	if baseDir == "" {
		baseDir = store.WorkingDir
	}
	store.Mu.Unlock()

	if targetDir == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "No working directory selected. Please select a folder first.",
		})
		return
	}

	cleanTarget := filepath.Clean(targetDir)
	if fi, err := os.Stat(cleanTarget); err != nil || !fi.IsDir() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Working directory does not exist: " + cleanTarget,
		})
		return
	}

	result, parsed, err := python.GenerateModel(graphPayload, cleanTarget, baseDir)
	if err != nil {
		writeError(w, err)
		return
	}
	if !parsed {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
		return
	}

	// Only adopt the generated references if the canvas has not changed while
	// Python was running. Never replace newer edits with an older save snapshot.
	savedFolder, _ := filepath.Abs(filepath.Join(cleanTarget, graphPayload.Name))
	if saved, readErr := modelio.ReadModelCanvas(savedFolder); readErr == nil {
		store.Mu.Lock()
		p.AdoptSavedIntegrations(graphPayload, saved, savedFolder)
		store.Mu.Unlock()
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// LoadModelHandler loads a model from a folder containing <model_name>.json and <model_name>.py
// onto the active canvas.
func LoadModelHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Path string `json:"path"`
		Dir  string `json:"dir"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	folderPath := req.Path
	if folderPath == "" {
		folderPath = req.Dir
	}
	if folderPath == "" {
		folderPath = r.URL.Query().Get("path")
	}
	if folderPath == "" {
		folderPath = r.URL.Query().Get("dir")
	}

	folderPath = strings.TrimSpace(folderPath)
	if folderPath == "" {
		http.Error(w, "Model folder path is required", http.StatusBadRequest)
		return
	}

	graphData, err := modelio.Load(folderPath)
	if err != nil {
		writeError(w, err)
		return
	}
	cleanFolder := filepath.Clean(folderPath)

	store.Mu.Lock()
	defer store.Mu.Unlock()

	p := store.ImportGraph(graphData, cleanFolder)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"modelName": p.Name,
		"projectId": p.ID,
		"nodeCount": len(p.Nodes),
		"edgeCount": len(p.Edges),
	})
}

// InspectModelHandler checks if a directory contains a registered model (both json and py),
// determines if it has input blocks, and returns its input and output port specifications.
func InspectModelHandler(w http.ResponseWriter, r *http.Request) {
	targetPath := r.URL.Query().Get("path")
	if targetPath == "" && r.Body != nil {
		var req struct {
			Path string `json:"path"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		targetPath = req.Path
	}
	targetPath = strings.TrimSpace(targetPath)
	if targetPath == "" {
		http.Error(w, "Path parameter is required", http.StatusBadRequest)
		return
	}

	result, err := modelio.Inspect(targetPath)
	if err != nil {
		writeError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
