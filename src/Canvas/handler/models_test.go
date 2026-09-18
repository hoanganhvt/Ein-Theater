package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"web-app/Canvas/utils/graph"
)

func TestPasteGraphHandler(t *testing.T) {
	// Setup test project
	store.Mu.Lock()
	p := store.MakeProject("Test_Paste_Model")
	store.Projects[p.ID] = p
	store.CurrentProjectID = p.ID
	store.Mu.Unlock()

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
	store.Mu.Lock()
	p := store.MakeProject("Test_Move_Model")
	p.Nodes["n1"] = Node{ID: "n1", X: 100, Y: 100}
	p.Nodes["n2"] = Node{ID: "n2", X: 300, Y: 100}
	p.Edges["e1"] = Edge{
		ID:   "e1",
		From: "n1",
		To:   "n2",
		Lines: []Line{
			{First: Point{X: 100, Y: 100}, Last: Point{X: 300, Y: 100}},
		},
	}
	store.Projects[p.ID] = p
	store.CurrentProjectID = p.ID
	store.Mu.Unlock()

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

	store.Mu.Lock()
	p = store.Current()
	if p.Nodes["n1"].X != 200 || p.Nodes["n1"].Y != 200 {
		t.Errorf("expected n1 at (200, 200), got (%f, %f)", p.Nodes["n1"].X, p.Nodes["n1"].Y)
	}
	if p.Nodes["n2"].X != 400 || p.Nodes["n2"].Y != 200 {
		t.Errorf("expected n2 at (400, 200), got (%f, %f)", p.Nodes["n2"].X, p.Nodes["n2"].Y)
	}
	store.Mu.Unlock()

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

	store.Mu.Lock()
	p = store.Current()
	e1 := p.Edges["e1"]
	if len(e1.Lines) != 1 || e1.Lines[0].First.X != 200 || e1.Lines[0].Last.X != 400 {
		t.Errorf("expected updated edge lines, got %+v", e1.Lines)
	}
	store.Mu.Unlock()
}

func TestEdgeCreationAndOrdering(t *testing.T) {
	store.Mu.Lock()
	p := store.MakeProject("Test_Edge_Creation")
	store.Projects[p.ID] = p
	store.CurrentProjectID = p.ID
	// Add 4 test nodes
	p.Nodes["n0"] = Node{ID: "n0", Label: "input", X: 0, Y: 0}
	p.Nodes["n1"] = Node{ID: "n1", Label: "conv", X: 100, Y: 0}
	p.Nodes["n2"] = Node{ID: "n2", Label: "relu", X: 200, Y: 0}
	p.Nodes["n3"] = Node{ID: "n3", Label: "linear", X: 300, Y: 0}
	store.Mu.Unlock()

	// 1. Add edge 0: n0 -> n1
	req0 := httptest.NewRequest(http.MethodPost, "/api/addEdge?from=n0&to=n1", nil)
	w0 := httptest.NewRecorder()
	AddEdgeHandler(w0, req0)
	var e0 Edge
	json.NewDecoder(w0.Body).Decode(&e0)
	if e0.Index != nil {
		t.Errorf("expected edge index to be nil, got %v", *e0.Index)
	}
	if e0.EdgeType != "normal" {
		t.Errorf("expected edge type to be normal, got %s", e0.EdgeType)
	}

	// 2. Add edge 1: n1 -> n2
	req1 := httptest.NewRequest(http.MethodPost, "/api/addEdge?from=n1&to=n2", nil)
	w1 := httptest.NewRecorder()
	AddEdgeHandler(w1, req1)
	var e1 Edge
	json.NewDecoder(w1.Body).Decode(&e1)
	if e1.Index != nil {
		t.Errorf("expected edge index to be nil, got %v", *e1.Index)
	}

	// 3. Add edge 2: n0 -> n3
	req2 := httptest.NewRequest(http.MethodPost, "/api/addEdge?from=n0&to=n3", nil)
	w2 := httptest.NewRecorder()
	AddEdgeHandler(w2, req2)
	var e2 Edge
	json.NewDecoder(w2.Body).Decode(&e2)
	if e2.Index != nil {
		t.Errorf("expected edge index to be nil, got %v", e2.Index)
	}

	// 4. Delete e1 and verify remaining edges
	reqDel := httptest.NewRequest(http.MethodPost, "/api/deleteEdge?id="+e1.ID, nil)
	wDel := httptest.NewRecorder()
	DeleteEdgeHandler(wDel, reqDel)

	reqData := httptest.NewRequest(http.MethodGet, "/api/data", nil)
	wData := httptest.NewRecorder()
	DataHandler(wData, reqData)
	var graphData GraphData
	json.NewDecoder(wData.Body).Decode(&graphData)

	if len(graphData.Edges) != 2 {
		t.Fatalf("expected 2 edges remaining, got %d", len(graphData.Edges))
	}
	for _, ed := range graphData.Edges {
		if ed.Index != nil {
			t.Errorf("expected edge %s to have nil index, got %v", ed.ID, *ed.Index)
		}
		if ed.EdgeType != "normal" {
			t.Errorf("expected edge %s to have normal type, got %s", ed.ID, ed.EdgeType)
		}
	}
}

func TestEdgeBendingAndFoldModes(t *testing.T) {
	n1 := Node{ID: "n1", X: 100, Y: 100}
	n2 := Node{ID: "n2", X: 300, Y: 200}

	// 1. Test ComputeEdgeLinesWithMode
	linesH := graph.ComputeEdgeLinesWithMode(n1, n2, "horizontal", nil)
	if len(linesH) != 3 {
		t.Errorf("expected horizontal Z-bend to have 3 lines, got %d", len(linesH))
	}

	linesV := graph.ComputeEdgeLinesWithMode(n1, n2, "vertical", nil)
	if len(linesV) != 3 {
		t.Errorf("expected vertical Z-bend to have 3 lines, got %d", len(linesV))
	}

	linesLH := graph.ComputeEdgeLinesWithMode(n1, n2, "l-horizontal", nil)
	if len(linesLH) != 2 {
		t.Errorf("expected l-horizontal to have 2 lines, got %d", len(linesLH))
	}

	linesLV := graph.ComputeEdgeLinesWithMode(n1, n2, "l-vertical", nil)
	if len(linesLV) != 2 {
		t.Errorf("expected l-vertical to have 2 lines, got %d", len(linesLV))
	}

	customX := 250.0
	linesCustom := graph.ComputeEdgeLinesWithMode(n1, n2, "horizontal", &customX)
	if len(linesCustom) != 3 {
		t.Errorf("expected customFold horizontal to have 3 lines, got %d", len(linesCustom))
	}
	if linesCustom[0].Last.X != 250.0 {
		t.Errorf("expected customFold line 0 to fold at X=250, got %f", linesCustom[0].Last.X)
	}

	// 2. Test AddEdgeHandler with FoldMode and CustomFold via JSON
	store.Mu.Lock()
	p := store.MakeProject("Test_Edge_Bending_Model")
	p.Nodes["n1"] = n1
	p.Nodes["n2"] = n2
	store.Projects[p.ID] = p
	store.CurrentProjectID = p.ID
	store.Mu.Unlock()

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
