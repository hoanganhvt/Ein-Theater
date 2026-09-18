package handler

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSnapshotDoesNotWaitForShapeWorker(t *testing.T) {
	store.Mu.Lock()
	p := store.MakeProject("latency_test")
	p.Nodes["linear_0"] = Node{ID: "linear_0", LayerType: "nn.Linear", X: 50, Params: map[string]interface{}{"out_features": 10}}
	store.Projects[p.ID] = p
	store.Mu.Unlock()
	t.Cleanup(func() { store.Mu.Lock(); delete(store.Projects, p.ID); store.Mu.Unlock() })

	// Block the analysis boundary without needing Python installed.
	previous := analyzeGraph
	blocked := make(chan struct{})
	analyzeGraph = func(data GraphData, base string) (GraphData, error) {
		<-blocked
		return data, nil
	}
	defer func() { close(blocked); analyzeGraph = previous }()
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
	p := &Project{ID: "p", Nodes: map[string]Node{
		"n": {ID: "n", X: 50, Params: map[string]interface{}{"out_features": 10}},
	}, Edges: map[string]Edge{"e": {ID: "e", From: "n", To: "n", FoldMode: "horizontal"}}}
	snapshot := p.GraphSnapshot()
	analyzed := p.GraphSnapshot()
	analyzed.Nodes[0].TensorInfo = &TensorInfo{Output: []int{1, 10}}
	node := p.Nodes["n"]
	node.X = 200
	p.Nodes["n"] = node
	edge := p.Edges["e"]
	edge.FoldMode = "vertical"
	p.Edges["e"] = edge
	if !p.ApplyAnalysis(snapshot, analyzed) {
		t.Fatal("layout-only changes discarded shape analysis")
	}
	if p.Nodes["n"].X != 200 || p.Edges["e"].FoldMode != "vertical" || p.Nodes["n"].TensorInfo == nil {
		t.Fatal("background analysis did not preserve live layout")
	}
	snapshot = p.GraphSnapshot()
	p.Nodes["n"].Params["out_features"] = 20
	if p.ApplyAnalysis(snapshot, analyzed) {
		t.Fatal("a semantic parameter edit must still reject stale analysis")
	}
}
