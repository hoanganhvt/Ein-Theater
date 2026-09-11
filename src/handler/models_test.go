package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFixModelName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"my model", "my_model"},
		{"123 cnn", "model_123_cnn"},
		{"123model", "model_123model"},
		{"42", "model_42"},
		{"0_resnet", "model_0_resnet"},
		{"resnet50", "resnet50"},
		{"model 1", "model_1"},
		{"", "model"},
		{"   ", "model"},
		{"Untitled Model", "Untitled_Model"},
	}

	for _, tt := range tests {
		got := FixModelName(tt.input)
		if got != tt.expected {
			t.Errorf("FixModelName(%q) = %q; expected %q", tt.input, got, tt.expected)
		}
		if !IsValidModelFolderName(got) {
			t.Errorf("FixModelName(%q) = %q, which is not a valid model folder name", tt.input, got)
		}
	}
}

func TestPasteGraphHandler(t *testing.T) {
	// Setup test project
	mu.Lock()
	p := makeProject("Test_Paste_Model")
	projects[p.ID] = p
	currentProjectID = p.ID
	mu.Unlock()

	// Initial node
	initNode := Node{
		ID:        "linear_0",
		Label:     "linear 0",
		LayerType: "nn.Linear",
		X:         100,
		Y:         100,
		Params:    map[string]interface{}{"in_features": 128.0, "out_features": 64.0},
	}
	initRelu := Node{
		ID:        "relu_0",
		Label:     "relu 0",
		LayerType: "nn.ReLU",
		X:         300,
		Y:         100,
	}
	initEdge := Edge{
		ID:   "e0",
		From: "linear_0",
		To:   "relu_0",
		Lines: []Line{
			{First: Point{X: 100, Y: 100}, Last: Point{X: 300, Y: 100}},
		},
	}

	// Payload copying linear_0 and relu_0 plus edge e0, with dx=50, dy=50
	reqBody := PasteGraphReq{
		Nodes: []Node{initNode, initRelu},
		Edges: []Edge{initEdge},
		Dx:    50,
		Dy:    50,
	}

	raw, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/api/paste", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	PasteGraphHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp PasteGraphResp
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(resp.Nodes) != 2 {
		t.Fatalf("expected 2 created nodes, got %d", len(resp.Nodes))
	}
	if len(resp.Edges) != 1 {
		t.Fatalf("expected 1 created edge, got %d", len(resp.Edges))
	}

	pastedLinear := resp.Nodes[0]
	if pastedLinear.LayerType != "nn.Linear" {
		t.Errorf("expected layerType nn.Linear, got %s", pastedLinear.LayerType)
	}
	if pastedLinear.X != 150 || pastedLinear.Y != 150 {
		t.Errorf("expected coordinates (150, 150), got (%f, %f)", pastedLinear.X, pastedLinear.Y)
	}
	if pastedLinear.Params["in_features"] != 128.0 {
		t.Errorf("expected in_features 128, got %v", pastedLinear.Params["in_features"])
	}

	pastedEdge := resp.Edges[0]
	if pastedEdge.From != resp.Nodes[0].ID || pastedEdge.To != resp.Nodes[1].ID {
		t.Errorf("expected edge from %s to %s, got from %s to %s",
			resp.Nodes[0].ID, resp.Nodes[1].ID, pastedEdge.From, pastedEdge.To)
	}
	if len(pastedEdge.Lines) > 0 {
		if pastedEdge.Lines[0].First.X != 150 || pastedEdge.Lines[0].First.Y != 150 {
			t.Errorf("expected offset edge line First (150, 150), got (%f, %f)",
				pastedEdge.Lines[0].First.X, pastedEdge.Lines[0].First.Y)
		}
	}
}

func TestMoveNodesAndEdgesHandler(t *testing.T) {
	mu.Lock()
	p := makeProject("Test_Move_Model")
	p.nodes["n1"] = Node{ID: "n1", X: 100, Y: 100}
	p.nodes["n2"] = Node{ID: "n2", X: 300, Y: 100}
	p.edges["e1"] = Edge{
		ID:   "e1",
		From: "n1",
		To:   "n2",
		Lines: []Line{
			{First: Point{X: 100, Y: 100}, Last: Point{X: 300, Y: 100}},
		},
	}
	projects[p.ID] = p
	currentProjectID = p.ID
	mu.Unlock()

	// Test MoveNodesHandler
	movePayload := []MoveNodeItem{
		{ID: "n1", X: 200, Y: 200},
		{ID: "n2", X: 400, Y: 200},
	}
	rawMove, _ := json.Marshal(movePayload)
	reqMove := httptest.NewRequest(http.MethodPost, "/api/moveNodes", bytes.NewReader(rawMove))
	reqMove.Header.Set("Content-Type", "application/json")
	wMove := httptest.NewRecorder()
	MoveNodesHandler(wMove, reqMove)
	if wMove.Code != http.StatusOK {
		t.Fatalf("expected 200 from MoveNodesHandler, got %d", wMove.Code)
	}

	mu.Lock()
	p = cur()
	if p.nodes["n1"].X != 200 || p.nodes["n1"].Y != 200 {
		t.Errorf("expected n1 at (200, 200), got (%f, %f)", p.nodes["n1"].X, p.nodes["n1"].Y)
	}
	if p.nodes["n2"].X != 400 || p.nodes["n2"].Y != 200 {
		t.Errorf("expected n2 at (400, 200), got (%f, %f)", p.nodes["n2"].X, p.nodes["n2"].Y)
	}
	mu.Unlock()

	// Test UpdateEdgesHandler
	edgePayload := []UpdateEdgeReq{
		{
			ID: "e1",
			Lines: []Line{
				{First: Point{X: 200, Y: 200}, Last: Point{X: 400, Y: 200}},
			},
		},
	}
	rawEdge, _ := json.Marshal(edgePayload)
	reqEdge := httptest.NewRequest(http.MethodPost, "/api/updateEdges", bytes.NewReader(rawEdge))
	reqEdge.Header.Set("Content-Type", "application/json")
	wEdge := httptest.NewRecorder()
	UpdateEdgesHandler(wEdge, reqEdge)
	if wEdge.Code != http.StatusOK {
		t.Fatalf("expected 200 from UpdateEdgesHandler, got %d", wEdge.Code)
	}

	mu.Lock()
	p = cur()
	e1 := p.edges["e1"]
	if len(e1.Lines) != 1 || e1.Lines[0].First.X != 200 || e1.Lines[0].Last.X != 400 {
		t.Errorf("expected updated edge lines, got %+v", e1.Lines)
	}
	mu.Unlock()
}

