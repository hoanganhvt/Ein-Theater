package graph

// AddNodeReq defines optional JSON payload for AddNodeHandler.
type AddNodeReq struct {
	Label     string                 `json:"label"`
	LayerType string                 `json:"layerType"`
	X         float64                `json:"x"`
	Y         float64                `json:"y"`
	Params    map[string]interface{} `json:"params,omitempty"`
	Shape     string                 `json:"shape,omitempty"`
}

// UpdateNodeReq defines payload for updating node parameters
type UpdateNodeReq struct {
	ID         string                 `json:"id"`
	Label      string                 `json:"label,omitempty"`
	LayerType  string                 `json:"layerType,omitempty"`
	Params     map[string]interface{} `json:"params,omitempty"`
	Parent     *string                `json:"parent,omitempty"`
	ParentZone *string                `json:"parentZone,omitempty"`
}

// MoveNodeItem defines coordinates for an individual node in a batch move.
type MoveNodeItem struct {
	ID string  `json:"id"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
}

// AddEdgeReq defines payload for adding an edge with optional custom straight lines and fold mode.
type AddEdgeReq struct {
	From       string   `json:"from"`
	To         string   `json:"to"`
	Lines      []Line   `json:"lines"`
	EdgeType   string   `json:"edgeType,omitempty"`
	FoldMode   string   `json:"foldMode,omitempty"`
	CustomFold *float64 `json:"customFold,omitempty"`
}

// UpdateEdgeReq defines the payload for updating an edge's custom lines/folds.
type UpdateEdgeReq struct {
	ID         string   `json:"id"`
	Lines      []Line   `json:"lines"`
	EdgeType   string   `json:"edgeType,omitempty"`
	FoldMode   string   `json:"foldMode,omitempty"`
	CustomFold *float64 `json:"customFold,omitempty"`
}

// PasteGraphReq defines payload for copying and pasting a collection of nodes and edges.
type PasteGraphReq struct {
	Nodes []Node  `json:"nodes"`
	Edges []Edge  `json:"edges"`
	Dx    float64 `json:"dx"`
	Dy    float64 `json:"dy"`
}

type PasteGraphResp struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}
