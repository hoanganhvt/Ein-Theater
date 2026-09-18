package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"web-app/Canvas/utils/graph"
	"web-app/Canvas/utils/naming"
)

// ListProjectsHandler lists all projects.
func ListProjectsHandler(w http.ResponseWriter, r *http.Request) {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	resp := store.ListProjects()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// CreateProjectHandler creates a new project and switches to it.
func CreateProjectHandler(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		name = "Untitled_Model"
	} else if !naming.IsValidModelFolderName(name) {
		name = naming.FixModelName(name)
	}
	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.CreateProject(name)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ProjectMeta{ID: p.ID, Name: p.Name})
}

// SwitchProjectHandler switches the active project.
func SwitchProjectHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	store.Mu.Lock()
	defer store.Mu.Unlock()
	if !store.SwitchProject(id) {
		http.Error(w, "project not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// DeleteProjectHandler deletes a project (unless it's the last one).
func DeleteProjectHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	store.Mu.Lock()
	defer store.Mu.Unlock()
	if err := store.DeleteProject(id); err != nil {
		if errors.Is(err, graph.ErrLastProject) {
			http.Error(w, err.Error(), http.StatusBadRequest)
		} else {
			http.Error(w, err.Error(), http.StatusNotFound)
		}
		return
	}

	w.WriteHeader(http.StatusOK)
}

// RenameModelHandler renames the current project.
func RenameModelHandler(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if !naming.IsValidModelFolderName(name) {
		name = naming.FixModelName(name)
	}
	store.Mu.Lock()
	store.Current().Name = name
	store.Mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok", "name": name})
}
