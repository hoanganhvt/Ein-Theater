package python

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	graphdata "web-app/Canvas/utils/graph"
)

func TestPythonWorkerFallsBackWhenPython3CannotStart(t *testing.T) {
	requireUnixShellFake(t)
	dir := t.TempDir()
	python3 := filepath.Join(dir, "python3")
	if err := os.WriteFile(python3, []byte("#!/missing-interpreter\n"), 0755); err != nil {
		t.Fatal(err)
	}
	python := filepath.Join(dir, "python")
	if err := os.WriteFile(python, []byte("#!/bin/sh\necho python >> \"$TEST_PYTHON_LOG\"\nwhile IFS= read -r request; do printf '{\"graph\":{\"name\":\"fallback\"}}\\n'; done\n"), 0755); err != nil {
		t.Fatal(err)
	}
	log := filepath.Join(dir, "calls")
	t.Setenv("PATH", dir)
	t.Setenv("TEST_PYTHON_LOG", log)

	worker := &pythonShapeWorker{}
	defer worker.stop()
	result, err := worker.analyze(graphdata.GraphData{Name: "request", Nodes: []graphdata.Node{{ID: "n"}}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Name != "fallback" {
		t.Fatalf("worker result = %#v", result)
	}
	if got := readFakeLog(t, log); got != "python" {
		t.Fatalf("interpreter calls = %q, want python fallback only", got)
	}
}

func TestPythonWorkerFallsBackWhenPython3ExitsBeforeResponse(t *testing.T) {
	requireUnixShellFake(t)
	dir := installFakePython(t, map[string]string{
		"python3": "#!/bin/sh\necho python3 >> \"$TEST_PYTHON_LOG\"\nexit 1\n",
		"python":  "#!/bin/sh\necho python >> \"$TEST_PYTHON_LOG\"\nif IFS= read -r request || [ -n \"$request\" ]; then printf '%s' \"$request\" > \"$TEST_PYTHON_INPUT\"; fi\nprintf '{\"graph\":{\"name\":\"fallback-exchange\"}}\\n'\n",
	})
	log := filepath.Join(dir, "calls")
	inputPath := filepath.Join(dir, "python-input")
	t.Setenv("PATH", dir)
	t.Setenv("TEST_PYTHON_LOG", log)
	t.Setenv("TEST_PYTHON_INPUT", inputPath)

	worker := &pythonShapeWorker{}
	defer worker.stop()
	result, err := worker.analyze(graphdata.GraphData{Name: "retry-exchange", Nodes: []graphdata.Node{{ID: "n"}}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Name != "fallback-exchange" {
		t.Fatalf("worker result = %#v", result)
	}
	if got := readFakeLog(t, log); got != "python3\npython" {
		t.Fatalf("interpreter calls = %q, want one call to each interpreter", got)
	}
	request, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(request), "retry-exchange") {
		t.Fatalf("fallback did not receive the original request: %q", request)
	}
}

func TestPythonWorkerDoesNotFallbackAfterPython3Starts(t *testing.T) {
	requireUnixShellFake(t)
	dir := installFakePython(t, map[string]string{
		"python3": "#!/bin/sh\necho python3 >> \"$TEST_PYTHON_LOG\"\nwhile IFS= read -r request; do printf '{\"error\":\"declared graph error\"}\\n'; done\n",
		"python":  "#!/bin/sh\necho python >> \"$TEST_PYTHON_LOG\"\nexit 99\n",
	})
	log := filepath.Join(dir, "calls")
	t.Setenv("PATH", dir)
	t.Setenv("TEST_PYTHON_LOG", log)

	worker := &pythonShapeWorker{}
	defer worker.stop()
	_, err := worker.analyze(graphdata.GraphData{Name: "request", Nodes: []graphdata.Node{{ID: "n"}}}, "")
	if err == nil || !strings.Contains(err.Error(), "declared graph error") {
		t.Fatalf("worker error = %v", err)
	}
	if got := readFakeLog(t, log); got != "python3" {
		t.Fatalf("interpreter calls = %q, want python3 only", got)
	}
}

func requireUnixShellFake(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("shell-script fake interpreters are not portable to Windows")
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
