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

func TestEdgeIndexingAndOrdering(t *testing.T) {
	mu.Lock()
	p := makeProject("Test_Edge_Indexing")
	projects[p.ID] = p
	currentProjectID = p.ID
	// Add 4 test nodes
	p.nodes["n0"] = Node{ID: "n0", Label: "input", X: 0, Y: 0}
	p.nodes["n1"] = Node{ID: "n1", Label: "conv", X: 100, Y: 0}
	p.nodes["n2"] = Node{ID: "n2", Label: "relu", X: 200, Y: 0}
	p.nodes["n3"] = Node{ID: "n3", Label: "linear", X: 300, Y: 0}
	mu.Unlock()

	// 1. Add normal edge 0: n0 -> n1
	req0 := httptest.NewRequest(http.MethodPost, "/api/addEdge?from=n0&to=n1", nil)
	w0 := httptest.NewRecorder()
	AddEdgeHandler(w0, req0)
	var e0 Edge
	json.NewDecoder(w0.Body).Decode(&e0)
	if e0.Index != nil {
		t.Errorf("expected normal edge index to be nil, got %v", *e0.Index)
	}

	// 2. Add normal edge 1: n1 -> n2
	req1 := httptest.NewRequest(http.MethodPost, "/api/addEdge?from=n1&to=n2", nil)
	w1 := httptest.NewRecorder()
	AddEdgeHandler(w1, req1)
	var e1 Edge
	json.NewDecoder(w1.Body).Decode(&e1)
	if e1.Index != nil {
		t.Errorf("expected normal edge index to be nil, got %v", *e1.Index)
	}

	// 3. Add special residual edge 2: n0 -> n3
	req2 := httptest.NewRequest(http.MethodPost, "/api/addEdge?from=n0&to=n3&type=residual", nil)
	w2 := httptest.NewRecorder()
	AddEdgeHandler(w2, req2)
	var e2 Edge
	json.NewDecoder(w2.Body).Decode(&e2)
	if e2.Index == nil || *e2.Index != 0 {
		t.Errorf("expected residual edge index to be 0, got %v", e2.Index)
	}

	// 4. Add special skip edge 3: n1 -> n3
	req3 := httptest.NewRequest(http.MethodPost, "/api/addEdge?from=n1&to=n3&type=skip", nil)
	w3 := httptest.NewRecorder()
	AddEdgeHandler(w3, req3)
	var e3 Edge
	json.NewDecoder(w3.Body).Decode(&e3)
	if e3.Index == nil || *e3.Index != 1 {
		t.Errorf("expected skip edge index to be 1, got %v", e3.Index)
	}

	// 5. Test SetEdgeTypeHandler: switch e2 to normal
	reqSwitch := httptest.NewRequest(http.MethodPost, "/api/setEdgeType?id="+e2.ID+"&type=normal", nil)
	wSwitch := httptest.NewRecorder()
	SetEdgeTypeHandler(wSwitch, reqSwitch)
	var e2Switched Edge
	json.NewDecoder(wSwitch.Body).Decode(&e2Switched)
	if e2Switched.Index != nil {
		t.Errorf("expected switched edge to have nil index, got %v", *e2Switched.Index)
	}

	// Verify e3 re-indexed to 0 as the only remaining special edge,
	// and verify that all special edges are placed behind all normal edges.
	reqData := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	wData := httptest.NewRecorder()
	DataHandler(wData, reqData)
	var graphData GraphData
	json.NewDecoder(wData.Body).Decode(&graphData)

	seenSpecial := false
	for _, ed := range graphData.Edges {
		if IsSpecialEdgeType(ed.EdgeType) {
			seenSpecial = true
			if ed.ID == e3.ID {
				if ed.Index == nil || *ed.Index != 0 {
					t.Errorf("expected e3 to be reindexed to 0, got %v", ed.Index)
				}
			}
		} else {
			if seenSpecial {
				t.Errorf("found normal edge %s after special edge; all special edges must be placed behind all normal edges", ed.ID)
			}
			if ed.Index != nil {
				t.Errorf("expected normal edge %s to have nil index, got %v", ed.ID, *ed.Index)
			}
		}
	}
}

func TestEdgeBendingAndFoldModes(t *testing.T) {
	n1 := Node{ID: "n1", X: 100, Y: 100}
	n2 := Node{ID: "n2", X: 300, Y: 200}

	// 1. Test ComputeEdgeLinesWithMode
	linesH := ComputeEdgeLinesWithMode(n1, n2, "horizontal", nil)
	if len(linesH) != 3 {
		t.Errorf("expected horizontal Z-bend to have 3 lines, got %d", len(linesH))
	}

	linesV := ComputeEdgeLinesWithMode(n1, n2, "vertical", nil)
	if len(linesV) != 3 {
		t.Errorf("expected vertical Z-bend to have 3 lines, got %d", len(linesV))
	}

	linesLH := ComputeEdgeLinesWithMode(n1, n2, "l-horizontal", nil)
	if len(linesLH) != 2 {
		t.Errorf("expected l-horizontal to have 2 lines, got %d", len(linesLH))
	}

	linesLV := ComputeEdgeLinesWithMode(n1, n2, "l-vertical", nil)
	if len(linesLV) != 2 {
		t.Errorf("expected l-vertical to have 2 lines, got %d", len(linesLV))
	}

	customX := 250.0
	linesCustom := ComputeEdgeLinesWithMode(n1, n2, "horizontal", &customX)
	if len(linesCustom) != 3 {
		t.Errorf("expected customFold horizontal to have 3 lines, got %d", len(linesCustom))
	}
	if linesCustom[0].Last.X != 250.0 {
		t.Errorf("expected customFold line 0 to fold at X=250, got %f", linesCustom[0].Last.X)
	}

	// 2. Test AddEdgeHandler with FoldMode and CustomFold via JSON
	mu.Lock()
	p := makeProject("Test_Edge_Bending_Model")
	p.nodes["n1"] = n1
	p.nodes["n2"] = n2
	projects[p.ID] = p
	currentProjectID = p.ID
	mu.Unlock()

	foldVal := 150.0
	addReq := AddEdgeReq{
		From:       "n1",
		To:         "n2",
		FoldMode:   "vertical",
		CustomFold: &foldVal,
	}
	body, _ := json.Marshal(addReq)
	req := httptest.NewRequest(http.MethodPost, "/api/addEdge", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	AddEdgeHandler(w, req)

	var created Edge
	json.NewDecoder(w.Body).Decode(&created)
	if created.FoldMode != "vertical" {
		t.Errorf("expected created edge foldMode to be 'vertical', got %q", created.FoldMode)
	}
	if created.CustomFold == nil || *created.CustomFold != 150.0 {
		t.Errorf("expected created edge customFold to be 150, got %v", created.CustomFold)
	}

	// 3. Test UpdateEdgeHandler updating FoldMode
	upReq := UpdateEdgeReq{
		ID:       created.ID,
		FoldMode: "horizontal",
	}
	upBody, _ := json.Marshal(upReq)
	reqUp := httptest.NewRequest(http.MethodPost, "/api/updateEdge", bytes.NewReader(upBody))
	reqUp.Header.Set("Content-Type", "application/json")
	wUp := httptest.NewRecorder()
	UpdateEdgeHandler(wUp, reqUp)

	var updated Edge
	json.NewDecoder(wUp.Body).Decode(&updated)
	if updated.FoldMode != "horizontal" {
		t.Errorf("expected updated edge foldMode to be 'horizontal', got %q", updated.FoldMode)
	}
}

