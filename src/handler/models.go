package handler

import (
	"fmt"
	"sync"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type Node struct {
	ID        string                 `json:"id"`
	Label     string                 `json:"label"`
	Shape     string                 `json:"shape,omitempty"`
	Color     string                 `json:"color,omitempty"`
	LayerType string                 `json:"layerType,omitempty"`
	Params    map[string]interface{} `json:"params,omitempty"`
	X         float64                `json:"x"`
	Y         float64                `json:"y"`
}

type Edge struct {
	ID   string `json:"id"`
	From string `json:"from"`
	To   string `json:"to"`
}

// Project holds all state for one model canvas.
type Project struct {
	ID         string
	Name       string
	nodes      map[string]Node
	edges      map[string]Edge
	nextNodeID int
	nextEdgeID int
}

// ProjectMeta is the lightweight summary returned in list responses.
type ProjectMeta struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type GraphData struct {
	ProjectID string `json:"projectId"`
	Name      string `json:"name"`
	Nodes     []Node `json:"nodes"`
	Edges     []Edge `json:"edges"`
}

type WorkspaceResponse struct {
	WorkingDir string `json:"workingDir"`
	Name       string `json:"name"`
}

type DirectoryItem struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
	Size  int64  `json:"size,omitempty"`
}

type BrowseResponse struct {
	Current string          `json:"current"`
	Parent  string          `json:"parent"`
	Drives  []string        `json:"drives,omitempty"`
	Folders []DirectoryItem `json:"folders"`
	Files   []DirectoryItem `json:"files"`
}

// ── Global State ──────────────────────────────────────────────────────────────

var (
	mu               sync.Mutex
	projects         = make(map[string]*Project)
	projectOrder     []string // preserves creation order for sidebar
	currentProjectID string
	nextProjectID    = 1
	workingDir       string
)

// makeProject allocates a new empty Project and pre-populates it with the
// default PyTorch layer palette.
func makeProject(name string) *Project {
	id := fmt.Sprintf("proj_%d", nextProjectID)
	nextProjectID++
	p := &Project{
		ID:         id,
		Name:       name,
		nodes:      make(map[string]Node),
		edges:      make(map[string]Edge),
		nextNodeID: 1,
		nextEdgeID: 1,
	}

	palette := []struct{ label string }{
		{"nn.Linear"}, {"nn.Conv2d"}, {"nn.ReLU"}, {"nn.MaxPool2d"},
		{"nn.Dropout"}, {"nn.BatchNorm2d"}, {"nn.LSTM"}, {"nn.Embedding"},
	}
	for i, block := range palette {
		nid := fmt.Sprintf("%d", p.nextNodeID)
		p.nodes[nid] = Node{
			ID:        nid,
			Label:     block.label,
			LayerType: block.label,
			Shape:     "box",
			X:         float64((i % 4) * 170),
			Y:         float64((i / 4) * 130),
		}
		p.nextNodeID++
	}
	return p
}

func init() {
	p := makeProject("Untitled Model")
	projects[p.ID] = p
	projectOrder = append(projectOrder, p.ID)
	currentProjectID = p.ID
	workingDir = ""
}

// cur returns the active project. Must be called with mu held.
func cur() *Project {
	return projects[currentProjectID]
}
