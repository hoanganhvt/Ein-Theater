package handler

import (
	"os/exec"
	"testing"
)

func TestAnalysisSnapshotsPreserveNewerEdits(t *testing.T) {
	p := &Project{ID: "p", Name: "model", nodes: map[string]Node{"x": {ID: "x", Params: map[string]interface{}{"value": "original"}}}, edges: map[string]Edge{}}
	snapshot := p.graphSnapshot()
	analyzed := p.graphSnapshot()
	analyzed.Nodes[0].TensorInfo = &TensorInfo{Message: "analysis result"}
	p.nodes["x"].Params["value"] = "new edit"
	if snapshot.Nodes[0].Params["value"] != "original" {
		t.Fatal("Snapshot aliases live parameters")
	}
	if p.applyAnalysis(snapshot, analyzed) {
		t.Fatal("Analysis replaced newer edits")
	}
	if !p.applyAnalysis(p.graphSnapshot(), analyzed) {
		t.Fatal("Unchanged snapshot was rejected")
	}
	if p.nodes["x"].TensorInfo.Message != "analysis result" {
		t.Fatal("Python metadata was not applied")
	}
}

func TestPythonWorkerProtocolAndReuse(t *testing.T) {
	python, err := exec.LookPath("python")
	if err != nil {
		t.Skip("Python not installed")
	}
	if err := exec.Command(python, "-c", "import torch").Run(); err != nil {
		t.Skip("PyTorch not installed")
	}
	worker := &pythonShapeWorker{}
	defer worker.stop()
	graph := GraphData{Name: "protocol", Nodes: []Node{{ID: "input", LayerType: "Input", Params: map[string]interface{}{"shape_preset": "12"}}, {ID: "dense", LayerType: "nn.Linear", Params: map[string]interface{}{"out_features": 3}}}, Edges: []Edge{{ID: "e0", From: "input", To: "dense"}}}
	result, err := worker.analyze(graph, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Nodes[1].TensorInfo == nil || result.Nodes[1].TensorInfo.Message != "" {
		t.Fatal("Missing Python metadata", result.Nodes[1])
	}
	if result.Nodes[1].Params["in_features"] != float64(12) {
		t.Fatal("Python parameters were not decoded", result.Nodes[1].Params)
	}
	pid := worker.cmd.Process.Pid
	if _, err = worker.analyze(graph, ""); err != nil {
		t.Fatal(err)
	}
	if worker.cmd.Process.Pid != pid {
		t.Fatal("Worker restarted between normal edits")
	}
	// A bad request must not poison the process for subsequent canvas edits.
	malformed := graph
	malformed.Nodes = append(append([]Node{}, graph.Nodes...), graph.Nodes[0])
	if _, err = worker.analyze(malformed, ""); err == nil {
		t.Fatal("Malformed graph should return an error")
	}
	if _, err = worker.analyze(graph, ""); err != nil {
		t.Fatal("Worker did not recover", err)
	}
}
