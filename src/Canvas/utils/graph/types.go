// Package graph owns canvas data, project edits, routing, and snapshot reconciliation.
// See document.md for component inputs, outputs, and test instructions.
package graph

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

// Shape metadata is produced by Python's FX interpreter.
type TensorInfo struct {
	Input      []int       `json:"input"`
	Output     []int       `json:"output"`
	OutputTree interface{} `json:"outputTree,omitempty"`
	Auto       []string    `json:"auto"`
	Message    string      `json:"message"`
}

type Node struct {
	AdaptedModel *GraphData             `json:"adaptedModel,omitempty"`
	TensorInfo   *TensorInfo            `json:"tensorInfo,omitempty"`
	ID           string                 `json:"id"`
	Label        string                 `json:"label"`
	Shape        string                 `json:"shape,omitempty"`
	Color        string                 `json:"color,omitempty"`
	LayerType    string                 `json:"layerType,omitempty"`
	Params       map[string]interface{} `json:"params,omitempty"`
	X            float64                `json:"x"`
	Y            float64                `json:"y"`
	Parent       string                 `json:"parent,omitempty"`
	ParentZone   string                 `json:"parentZone,omitempty"`
}

type Edge struct {
	ID         string   `json:"id"`
	From       string   `json:"from"`
	To         string   `json:"to"`
	Lines      []Line   `json:"lines"`
	EdgeType   string   `json:"edgeType,omitempty"`
	Index      *int     `json:"index,omitempty"`
	FoldMode   string   `json:"foldMode,omitempty"`
	CustomFold *float64 `json:"customFold,omitempty"`
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
