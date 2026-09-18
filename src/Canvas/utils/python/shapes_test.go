package python

import (
	"os/exec"
	"testing"
	graphdata "web-app/Canvas/utils/graph"
)

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
	graph := graphdata.GraphData{Name: "protocol", Nodes: []graphdata.Node{{ID: "input", LayerType: "Input", Params: map[string]interface{}{"shape_preset": "12"}}, {ID: "dense", LayerType: "nn.Linear", Params: map[string]interface{}{"out_features": 3}}}, Edges: []graphdata.Edge{{ID: "e0", From: "input", To: "dense"}}}
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
	malformed.Nodes = append(append([]graphdata.Node{}, graph.Nodes...), graph.Nodes[0])
	if _, err = worker.analyze(malformed, ""); err == nil {
		t.Fatal("Malformed graph should return an error")
	}
	if _, err = worker.analyze(graph, ""); err != nil {
		t.Fatal("Worker did not recover", err)
	}
}
