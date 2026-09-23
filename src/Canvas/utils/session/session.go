// Package session persists the editor state independently of generated models.
package session

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"web-app/Canvas/utils/graph"
)

const currentVersion = 1

type projectState struct {
	ID         string                `json:"id"`
	Name       string                `json:"name"`
	BaseDir    string                `json:"baseDir,omitempty"`
	Nodes      map[string]graph.Node `json:"nodes"`
	Edges      map[string]graph.Edge `json:"edges"`
	NodeOrder  []string              `json:"nodeOrder"`
	EdgeOrder  []string              `json:"edgeOrder"`
	NextNodeID int                   `json:"nextNodeId"`
	NextEdgeID int                   `json:"nextEdgeId"`
}

type state struct {
	Version          int            `json:"version"`
	WorkingDir       string         `json:"workingDir,omitempty"`
	CurrentProjectID string         `json:"currentProjectId"`
	NextProjectID    int            `json:"nextProjectId"`
	ProjectOrder     []string       `json:"projectOrder"`
	Projects         []projectState `json:"projects"`
}

// Manager serializes debounced snapshots of a Store to a versioned JSON file.
type Manager struct {
	store *graph.Store
	path  string
	mu    sync.Mutex
	timer *time.Timer
}

func New(dataDir string, store *graph.Store) *Manager {
	return &Manager{store: store, path: filepath.Join(dataDir, "session-v1.json")}
}

func (m *Manager) Load() error {
	raw, err := os.ReadFile(m.path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var saved state
	if err := json.Unmarshal(raw, &saved); err != nil || saved.Version != currentVersion {
		recovery := m.path + ".corrupt-" + time.Now().Format("20060102-150405")
		_ = os.Rename(m.path, recovery)
		if err != nil {
			return fmt.Errorf("invalid session moved to %s: %w", recovery, err)
		}
		return fmt.Errorf("unsupported session version moved to %s", recovery)
	}
	if len(saved.Projects) == 0 {
		return nil
	}

	projects := make(map[string]*graph.Project, len(saved.Projects))
	for _, item := range saved.Projects {
		if item.ID == "" {
			continue
		}
		if item.Nodes == nil {
			item.Nodes = make(map[string]graph.Node)
		}
		if item.Edges == nil {
			item.Edges = make(map[string]graph.Edge)
		}
		projects[item.ID] = &graph.Project{
			ID: item.ID, Name: item.Name, BaseDir: item.BaseDir,
			Nodes: item.Nodes, Edges: item.Edges,
			NodeOrder: item.NodeOrder, EdgeOrder: item.EdgeOrder,
			NextNodeID: item.NextNodeID, NextEdgeID: item.NextEdgeID,
		}
	}
	order := make([]string, 0, len(saved.ProjectOrder))
	seen := make(map[string]bool)
	for _, id := range saved.ProjectOrder {
		if _, ok := projects[id]; ok && !seen[id] {
			order = append(order, id)
			seen[id] = true
		}
	}
	for id := range projects {
		if !seen[id] {
			order = append(order, id)
		}
	}
	if len(order) == 0 {
		return nil
	}
	current := saved.CurrentProjectID
	if _, ok := projects[current]; !ok {
		current = order[0]
	}
	workingDir := saved.WorkingDir
	if info, err := os.Stat(workingDir); workingDir != "" && (err != nil || !info.IsDir()) {
		workingDir = ""
	}

	m.store.Mu.Lock()
	m.store.Projects = projects
	m.store.ProjectOrder = order
	m.store.CurrentProjectID = current
	m.store.NextProjectID = saved.NextProjectID
	if m.store.NextProjectID < 1 {
		m.store.NextProjectID = len(projects) + 1
	}
	m.store.WorkingDir = workingDir
	m.store.Mu.Unlock()
	return nil
}

func (m *Manager) Schedule() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.timer != nil {
		m.timer.Stop()
	}
	m.timer = time.AfterFunc(300*time.Millisecond, func() { _ = m.Flush() })
}

func (m *Manager) Flush() error {
	m.mu.Lock()
	if m.timer != nil {
		m.timer.Stop()
		m.timer = nil
	}
	m.mu.Unlock()

	saved := state{Version: currentVersion}
	m.store.Mu.Lock()
	saved.WorkingDir = m.store.WorkingDir
	saved.CurrentProjectID = m.store.CurrentProjectID
	saved.NextProjectID = m.store.NextProjectID
	saved.ProjectOrder = append([]string(nil), m.store.ProjectOrder...)
	for _, id := range m.store.ProjectOrder {
		p, ok := m.store.Projects[id]
		if !ok {
			continue
		}
		saved.Projects = append(saved.Projects, projectState{
			ID: p.ID, Name: p.Name, BaseDir: p.BaseDir,
			Nodes: p.Nodes, Edges: p.Edges,
			NodeOrder: append([]string(nil), p.NodeOrder...), EdgeOrder: append([]string(nil), p.EdgeOrder...),
			NextNodeID: p.NextNodeID, NextEdgeID: p.NextEdgeID,
		})
	}
	raw, err := json.MarshalIndent(saved, "", "  ")
	m.store.Mu.Unlock()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(m.path), 0700); err != nil {
		return err
	}
	temp := m.path + ".tmp"
	if err := os.WriteFile(temp, raw, 0600); err != nil {
		return err
	}
	backup := m.path + ".bak"
	_ = os.Remove(backup)
	if _, err := os.Stat(m.path); err == nil {
		if err := os.Rename(m.path, backup); err != nil {
			return err
		}
	}
	if err := os.Rename(temp, m.path); err != nil {
		_ = os.Rename(backup, m.path)
		return err
	}
	_ = os.Remove(backup)
	return nil
}
