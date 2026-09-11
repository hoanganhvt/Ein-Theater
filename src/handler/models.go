package handler

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// ── Types ─────────────────────────────────────────────────────────────────────

// Point represents a 2D coordinate on the circuit grid canvas.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Line represents a straight line segment with its first and last coordinates.
type Line struct {
	First Point `json:"first"`
	Last  Point `json:"last"`
	From  Point `json:"from"`
	To    Point `json:"to"`
}

type Node struct {
	ID         string                 `json:"id"`
	Label      string                 `json:"label"`
	Shape      string                 `json:"shape,omitempty"`
	Color      string                 `json:"color,omitempty"`
	LayerType  string                 `json:"layerType,omitempty"`
	Params     map[string]interface{} `json:"params,omitempty"`
	X          float64                `json:"x"`
	Y          float64                `json:"y"`
	Parent     string                 `json:"parent,omitempty"`
	ParentZone string                 `json:"parentZone,omitempty"`
}

type Edge struct {
	ID       string `json:"id"`
	From     string `json:"from"`
	To       string `json:"to"`
	Lines    []Line `json:"lines"`
	EdgeType string `json:"edgeType,omitempty"`
}

const GridSize = 50.0

// ComputeEdgeLines computes orthogonal straight line segments (circuit traces)
// connecting fromNode to toNode on the electrical circuit grid.
// Each segment contains the coordinates of its first and last points.
func ComputeEdgeLines(from Node, to Node) []Line {
	x1, y1 := from.X, from.Y
	x2, y2 := to.X, to.Y

	if x1 == x2 && y1 == y2 {
		return []Line{}
	}

	makeLine := func(px1, py1, px2, py2 float64) Line {
		p1 := Point{X: px1, Y: py1}
		p2 := Point{X: px2, Y: py2}
		return Line{First: p1, Last: p2, From: p1, To: p2}
	}

	// 1. Single straight horizontal line
	if y1 == y2 {
		return []Line{makeLine(x1, y1, x2, y2)}
	}

	// 2. Single straight vertical line
	if x1 == x2 {
		return []Line{makeLine(x1, y1, x2, y2)}
	}

	// 3. Orthogonal right-angle route on the electrical circuit grid
	midX := math.Round(((x1+x2)/2.0)/GridSize) * GridSize
	if midX == x1 || midX == x2 {
		// L-route: 2 straight lines
		return []Line{
			makeLine(x1, y1, x2, y1),
			makeLine(x2, y1, x2, y2),
		}
	}

	// Z-route: 3 straight lines (horizontal -> vertical -> horizontal)
	return []Line{
		makeLine(x1, y1, midX, y1),
		makeLine(midX, y1, midX, y2),
		makeLine(midX, y2, x2, y2),
	}
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
	Name      string `json:"name"`
	Path      string `json:"path"`
	IsDir     bool   `json:"isDir"`
	Size      int64  `json:"size,omitempty"`
	IsModel   bool   `json:"isModel"`
	ModelName string `json:"modelName,omitempty"`
}

type BrowseResponse struct {
	Current string          `json:"current"`
	Parent  string          `json:"parent"`
	Drives  []string        `json:"drives,omitempty"`
	Folders []DirectoryItem `json:"folders"`
	Files   []DirectoryItem `json:"files"`
}

// IsValidModelFolderName checks whether a folder name satisfies:
// 1. Only normal Latin characters (a-z, A-Z) and numbers (0-9) (and optional underscore)
// 2. No white space
// 3. Character first, number later (first character must be a Latin letter a-z or A-Z)
func IsValidModelFolderName(name string) bool {
	if strings.Contains(name, " ") || name == "" {
		return false
	}
	first := name[0]
	if !((first >= 'a' && first <= 'z') || (first >= 'A' && first <= 'Z')) {
		return false
	}
	for i := 1; i < len(name); i++ {
		ch := name[i]
		if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_') {
			return false
		}
	}
	return true
}

// FixModelName sanitizes and fixes an invalid model name:
// - If the model name has space, replace space with _
// - If the model name has number before the text, add the word model_ infront of it
func FixModelName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "model"
	}

	// 1. If the model name has space, replace space with _
	if strings.Contains(name, " ") {
		name = strings.ReplaceAll(name, " ", "_")
	}

	// 2. If the model name has number before the text, add the word model_ infront of it
	hasNumBefore := false
	for i := 0; i < len(name); i++ {
		ch := name[i]
		if ch >= '0' && ch <= '9' {
			hasNumBefore = true
			break
		}
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') {
			break
		}
	}
	if hasNumBefore {
		name = "model_" + name
	}

	// Ensure all characters are valid Latin letters, digits, or underscore
	var sb strings.Builder
	for i := 0; i < len(name); i++ {
		ch := name[i]
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' {
			sb.WriteByte(ch)
		} else {
			sb.WriteByte('_')
		}
	}
	res := sb.String()

	// Ensure the first character is a letter
	if res == "" || !((res[0] >= 'a' && res[0] <= 'z') || (res[0] >= 'A' && res[0] <= 'Z')) {
		res = "model_" + strings.TrimLeft(res, "_")
		if res == "model_" {
			res = "model"
		}
	}
	return res
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

type moduleSeedDef struct {
	Type          string `json:"type"`
	DefaultInSeed bool   `json:"defaultInSeed"`
}

func loadDefaultSeedPalette() []string {
	paths := []string{
		filepath.Join("static", "data", "modules.json"),
		filepath.Join("src", "static", "data", "modules.json"),
		filepath.Join("data", "modules.json"),
		filepath.Join("src", "data", "modules.json"),
	}
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err == nil {
			var modules []moduleSeedDef
			if err := json.Unmarshal(data, &modules); err == nil {
				var seed []string
				for _, m := range modules {
					if m.DefaultInSeed {
						seed = append(seed, m.Type)
					}
				}
				if len(seed) > 0 {
					return seed
				}
			}
		}
	}
	return []string{
		"nn.Linear", "nn.Conv2d", "nn.ReLU", "nn.MaxPool2d",
		"nn.Dropout", "nn.BatchNorm2d", "nn.LSTM", "nn.Embedding",
	}
}

// layerTypeToPrefix returns the normalized lowercase prefix for a layer type.
// e.g. "nn.Linear" -> "linear", "nn.Conv2d" -> "conv", "nn.ReLU" -> "relu".
func layerTypeToPrefix(layerType string) string {
	clean := strings.TrimPrefix(layerType, "nn.")
	clean = strings.TrimPrefix(clean, "torch.")
	clean = strings.ToLower(clean)
	if clean == "conv2d" {
		clean = "conv"
	} else if clean == "batchnorm2d" {
		clean = "batchnorm"
	} else if clean == "maxpool2d" {
		clean = "maxpool"
	}
	var sb strings.Builder
	for _, ch := range clean {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') {
			sb.WriteRune(ch)
		}
	}
	res := sb.String()
	if res == "" {
		res = "block"
	}
	return res
}

// getNextNodeID finds the lowest index >= 0 for the given layer type
// such that <prefix>_<index> does not already exist in p.nodes.
// Scoped strictly to this model workspace.
func (p *Project) getNextNodeID(layerType string) string {
	prefix := layerTypeToPrefix(layerType)
	idx := 0
	for {
		id := fmt.Sprintf("%s_%d", prefix, idx)
		if _, exists := p.nodes[id]; !exists {
			return id
		}
		idx++
	}
}

// makeProject allocates a new empty Project with 0 nodes.
// Node and edge IDs start at 0 within each project workspace.
func makeProject(name string) *Project {
	id := fmt.Sprintf("proj_%d", nextProjectID)
	nextProjectID++
	p := &Project{
		ID:         id,
		Name:       name,
		nodes:      make(map[string]Node),
		edges:      make(map[string]Edge),
		nextNodeID: 0,
		nextEdgeID: 0,
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
