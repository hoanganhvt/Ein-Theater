package graph

import (
	"fmt"
	"sync"
)

// Store owns the shared canvas state. Callers must hold Mu while reading or
// changing its fields or any Project it contains. Release Mu before external IO.
type Store struct {
	Mu               sync.Mutex
	Projects         map[string]*Project
	ProjectOrder     []string
	CurrentProjectID string
	NextProjectID    int
	WorkingDir       string
}

// NewStore creates an independent store with one empty active project.
func NewStore() *Store {
	s := &Store{Projects: make(map[string]*Project), NextProjectID: 1}
	p := s.MakeProject("Untitled Model")
	s.Projects[p.ID] = p
	s.ProjectOrder = append(s.ProjectOrder, p.ID)
	s.CurrentProjectID = p.ID
	return s
}

// Current returns the active project. The caller must hold Mu.
func (s *Store) Current() *Project { return s.Projects[s.CurrentProjectID] }

// MakeProject allocates a new empty Project with 0 nodes.
// Node and edge IDs start at 0 within each project workspace.
func (s *Store) MakeProject(name string) *Project {
	id := fmt.Sprintf("proj_%d", s.NextProjectID)
	s.NextProjectID++
	p := &Project{
		ID:         id,
		Name:       name,
		Nodes:      make(map[string]Node),
		Edges:      make(map[string]Edge),
		EdgeOrder:  make([]string, 0),
		NextNodeID: 0,
		NextEdgeID: 0,
	}
	return p
}
