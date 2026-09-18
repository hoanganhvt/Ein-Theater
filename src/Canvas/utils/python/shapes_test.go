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
	graph.Nodes[0].Label = "\u26a1 [IC] Ti\u1ebfng Vi\u1ec7t \u2014 \u6a21\u578b"
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
	if result.Nodes[0].Label != graph.Nodes[0].Label {
		t.Fatal("Unicode label changed across the Python JSON pipe")
	}
	pid := worker.cmd.Process.Pid
	if result, err = worker.analyze(result, ""); err != nil {
		t.Fatal(err)
	}
	if result.Nodes[0].Label != graph.Nodes[0].Label {
		t.Fatal("Unicode label grew across repeated analysis")
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
