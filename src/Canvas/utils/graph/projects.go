package graph

import (
	"errors"
)

// ProjectList is the project selector response, preserving tab creation order.
type ProjectList struct {
	Current  string        `json:"current"`
	Projects []ProjectMeta `json:"projects"`
}

var ErrLastProject = errors.New("cannot delete the last model")
var ErrProjectNotFound = errors.New("project not found")

// ListProjects returns the active ID and summaries in creation order. Caller holds Mu.
func (s *Store) ListProjects() ProjectList {

	resp := ProjectList{Current: s.CurrentProjectID, Projects: []ProjectMeta{}}
	for _, id := range s.ProjectOrder {
		if p, ok := s.Projects[id]; ok {
			resp.Projects = append(resp.Projects, ProjectMeta{ID: p.ID, Name: p.Name})
		}
	}
	return resp
}

// CreateProject allocates and activates a project. Caller holds Mu.
func (s *Store) CreateProject(name string) *Project {
	p := s.MakeProject(name)
	s.Projects[p.ID] = p
	s.ProjectOrder = append(s.ProjectOrder, p.ID)
	s.CurrentProjectID = p.ID
	return p
}

// SwitchProject activates an existing project and reports whether it exists. Caller holds Mu.
func (s *Store) SwitchProject(id string) bool {
	if _, ok := s.Projects[id]; !ok {
		return false
	}
	s.CurrentProjectID = id
	return true
}

// DeleteProject removes a project while preserving at least one. Caller holds Mu.
func (s *Store) DeleteProject(id string) error {
	if len(s.Projects) <= 1 {
		return ErrLastProject
	}
	if _, ok := s.Projects[id]; !ok {
		return ErrProjectNotFound
	}
	delete(s.Projects, id)
	for i, oid := range s.ProjectOrder {
		if oid == id {
			s.ProjectOrder = append(s.ProjectOrder[:i], s.ProjectOrder[i+1:]...)
			break
		}
	}
	if s.CurrentProjectID == id {
		s.CurrentProjectID = s.ProjectOrder[0]
	}
	return nil
}
