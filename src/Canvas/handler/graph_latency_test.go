package handler

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSnapshotDoesNotWaitForShapeWorker(t *testing.T) {
	mu.Lock()
	p := makeProject("latency_test")
	p.nodes["linear_0"] = Node{ID: "linear_0", LayerType: "nn.Linear", X: 50, Params: map[string]interface{}{"out_features": 10}}
	projects[p.ID] = p
	mu.Unlock()
	t.Cleanup(func() { mu.Lock(); delete(projects, p.ID); mu.Unlock() })

	// Simulate a busy Python interpreter without needing Python installed.
	shapeWorker.mu.Lock()
	defer shapeWorker.mu.Unlock()
	response := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		DataHandler(response, httptest.NewRequest("GET", "/api/data?analyze=false&projectId="+p.ID, nil))
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("snapshot request blocked on the shape worker")
	}
	var graph GraphData
	if err := json.Unmarshal(response.Body.Bytes(), &graph); err != nil {
		t.Fatal(err)
	}
	if graph.ProjectID != p.ID || len(graph.Nodes) != 1 || graph.Nodes[0].X != 50 {
		t.Fatalf("incorrect project snapshot: %+v", graph)
	}
	if !strings.Contains(response.Header().Get("Server-Timing"), "snapshot;dur=") {
		t.Fatal("missing snapshot timing")
	}
	missing := httptest.NewRecorder()
	DataHandler(missing, httptest.NewRequest("GET", "/api/data?analyze=false&projectId=missing-project", nil))
	if missing.Code != 404 {
		t.Fatal("unknown pinned project must not return the active project")
	}
}

func TestBackgroundAnalysisPreservesConcurrentDrag(t *testing.T) {
	p := &Project{ID: "p", nodes: map[string]Node{
		"n": {ID: "n", X: 50, Params: map[string]interface{}{"out_features": 10}},
	}, edges: map[string]Edge{"e": {ID: "e", From: "n", To: "n", FoldMode: "horizontal"}}}
	snapshot := p.graphSnapshot()
	analyzed := p.graphSnapshot()
	analyzed.Nodes[0].TensorInfo = &TensorInfo{Output: []int{1, 10}}
	node := p.nodes["n"]
	node.X = 200
	p.nodes["n"] = node
	edge := p.edges["e"]
	edge.FoldMode = "vertical"
	p.edges["e"] = edge
	if !p.applyAnalysis(snapshot, analyzed) {
		t.Fatal("layout-only changes discarded shape analysis")
	}
	if p.nodes["n"].X != 200 || p.edges["e"].FoldMode != "vertical" || p.nodes["n"].TensorInfo == nil {
		t.Fatal("background analysis did not preserve live layout")
	}
	snapshot = p.graphSnapshot()
	p.nodes["n"].Params["out_features"] = 20
	if p.applyAnalysis(snapshot, analyzed) {
		t.Fatal("a semantic parameter edit must still reject stale analysis")
	}
}
