package handler

import (
	"encoding/json"
	"net/http"
)

// ListProjectsHandler lists all projects.
func ListProjectsHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	type Response struct {
		Current  string        `json:"current"`
		Projects []ProjectMeta `json:"projects"`
	}
	resp := Response{Current: currentProjectID, Projects: []ProjectMeta{}}
	for _, id := range projectOrder {
		if p, ok := projects[id]; ok {
			resp.Projects = append(resp.Projects, ProjectMeta{ID: p.ID, Name: p.Name})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// CreateProjectHandler creates a new project and switches to it.
func CreateProjectHandler(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		name = "Untitled_Model"
	} else if !IsValidModelFolderName(name) {
		name = FixModelName(name)
	}
	mu.Lock()
	defer mu.Unlock()
	p := makeProject(name)
	projects[p.ID] = p
	projectOrder = append(projectOrder, p.ID)
	currentProjectID = p.ID
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ProjectMeta{ID: p.ID, Name: p.Name})
}

// SwitchProjectHandler switches the active project.
func SwitchProjectHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	mu.Lock()
	defer mu.Unlock()
	if _, ok := projects[id]; !ok {
		http.Error(w, "project not found", http.StatusNotFound)
		return
	}
	currentProjectID = id
	w.WriteHeader(http.StatusOK)
}

// DeleteProjectHandler deletes a project (unless it's the last one).
func DeleteProjectHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	mu.Lock()
	defer mu.Unlock()
	if len(projects) <= 1 {
		http.Error(w, "cannot delete the last model", http.StatusBadRequest)
		return
	}
	if _, ok := projects[id]; !ok {
		http.Error(w, "project not found", http.StatusNotFound)
		return
	}
	delete(projects, id)
	for i, oid := range projectOrder {
		if oid == id {
			projectOrder = append(projectOrder[:i], projectOrder[i+1:]...)
			break
		}
	}
	if currentProjectID == id {
		currentProjectID = projectOrder[0]
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
	if !IsValidModelFolderName(name) {
		name = FixModelName(name)
	}
	mu.Lock()
	cur().Name = name
	mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok", "name": name})
}
