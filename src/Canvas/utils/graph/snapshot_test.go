package graph

import (
	"testing"
)

func TestAnalysisSnapshotsPreserveNewerEdits(t *testing.T) {
	p := &Project{ID: "p", Name: "model", Nodes: map[string]Node{"x": {ID: "x", Params: map[string]interface{}{"value": "original"}}}, Edges: map[string]Edge{}}
	snapshot := p.GraphSnapshot()
	analyzed := p.GraphSnapshot()
	analyzed.Nodes[0].TensorInfo = &TensorInfo{Message: "analysis result"}
	p.Nodes["x"].Params["value"] = "new edit"
	if snapshot.Nodes[0].Params["value"] != "original" {
		t.Fatal("Snapshot aliases live parameters")
	}
	if p.ApplyAnalysis(snapshot, analyzed) {
		t.Fatal("Analysis replaced newer edits")
	}
	if !p.ApplyAnalysis(p.GraphSnapshot(), analyzed) {
		t.Fatal("Unchanged snapshot was rejected")
	}
	if p.Nodes["x"].TensorInfo.Message != "analysis result" {
		t.Fatal("Python metadata was not applied")
	}
}
