package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"web-app/Canvas/utils/workspace"
)

// WorkspaceHandler returns the current working directory.
func WorkspaceHandler(w http.ResponseWriter, r *http.Request) {
	store.Mu.Lock()
	wd := store.WorkingDir
	store.Mu.Unlock()

	name := "None"
	if wd != "" {
		name = filepath.Base(wd)
	}

	resp := WorkspaceResponse{
		WorkingDir: wd,
		Name:       name,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// SetWorkspaceHandler updates the active working directory.
func SetWorkspaceHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		var body struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			path = body.Path
		}
	}

	path = strings.TrimSpace(path)
	if path == "" {
		http.Error(w, "Directory path is required", http.StatusBadRequest)
		return
	}

	cleanPath := filepath.Clean(path)
	fi, err := os.Stat(cleanPath)
	if err != nil {
		http.Error(w, "Directory does not exist: "+err.Error(), http.StatusBadRequest)
		return
	}
	if !fi.IsDir() {
		http.Error(w, "Path is not a directory", http.StatusBadRequest)
		return
	}

	store.Mu.Lock()
	store.WorkingDir = cleanPath
	store.Mu.Unlock()

	resp := WorkspaceResponse{
		WorkingDir: cleanPath,
		Name:       filepath.Base(cleanPath),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// BrowseWorkspaceHandler lists files and subfolders in the requested path.
func BrowseWorkspaceHandler(w http.ResponseWriter, r *http.Request) {
	store.Mu.Lock()
	targetDir := r.URL.Query().Get("dir")
	if targetDir == "" {
		targetDir = store.WorkingDir
	}
	store.Mu.Unlock()

	resp, err := workspace.Browse(targetDir)
	if err != nil {
		writeError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// SelectNativeFolderHandler opens the Windows native folder picker.
func SelectNativeFolderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	store.Mu.Lock()
	initialDir := store.WorkingDir
	store.Mu.Unlock()

	selected, err := workspace.PickFolder(initialDir)
	if err != nil {
		writeError(w, err)
		return
	}

	if selected == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"cancelled": true,
		})
		return
	}

	cleanPath := filepath.Clean(selected)
	fi, err := os.Stat(cleanPath)
	if err != nil || !fi.IsDir() {
		http.Error(w, "Selected path is not a valid directory", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cancelled":  false,
		"workingDir": cleanPath,
		"name":       filepath.Base(cleanPath),
	})
}

// CreateFolderHandler creates a new folder within the specified or active directory.
func CreateFolderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Dir  string `json:"dir"`
		Name string `json:"name"`
	}

	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if req.Name == "" {
		req.Name = r.URL.Query().Get("name")
	}
	if req.Dir == "" {
		req.Dir = r.URL.Query().Get("dir")
	}

	store.Mu.Lock()
	if req.Dir == "" {
		req.Dir = store.WorkingDir
	}
	store.Mu.Unlock()

	result, err := workspace.CreateFolder(req.Dir, req.Name)
	if err != nil {
		writeError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// DeleteModelFolderHandler removes a saved model folder from the active workspace.
func DeleteModelFolderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	store.Mu.Lock()
	workingDir := store.WorkingDir
	store.Mu.Unlock()
	if err := workspace.DeleteModelFolder(workingDir, req.Path); err != nil {
		writeError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
