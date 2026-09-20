package python

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	graphdata "web-app/Canvas/utils/graph"
)

func TestGenerateModelPrefersPython3(t *testing.T) {
	dir := installFakePython(t, map[string]string{
		"python3": "#!/bin/sh\necho python3 >> \"$TEST_PYTHON_LOG\"\nprintf '{\"status\":\"python3\"}'\n",
		"python":  "#!/bin/sh\necho python >> \"$TEST_PYTHON_LOG\"\nexit 99\n",
	})
	log := filepath.Join(dir, "calls")
	t.Setenv("PATH", dir)
	t.Setenv("TEST_PYTHON_LOG", log)

	result, parsed, err := GenerateModel(graphdata.GraphData{Name: "preferred"}, dir, dir)
	if err != nil || !parsed || result["status"] != "python3" {
		t.Fatalf("GenerateModel() = %#v, %t, %v", result, parsed, err)
	}
	if got := readFakeLog(t, log); got != "python3" {
		t.Fatalf("interpreter calls = %q, want python3 only", got)
	}
}

func TestGenerateModelFallsBackAndResendsInput(t *testing.T) {
	dir := installFakePython(t, map[string]string{
		"python3": "#!/bin/sh\necho python3 >> \"$TEST_PYTHON_LOG\"\nif IFS= read -r request || [ -n \"$request\" ]; then printf '%s' \"$request\"; fi > \"$TEST_PYTHON3_INPUT\"\necho first-attempt-failed >&2\nexit 1\n",
		"python":  "#!/bin/sh\necho python >> \"$TEST_PYTHON_LOG\"\nif IFS= read -r request || [ -n \"$request\" ]; then printf '%s' \"$request\"; fi > \"$TEST_PYTHON_INPUT\"\nprintf '{\"status\":\"fallback\"}'\n",
	})
	log := filepath.Join(dir, "calls")
	python3Input := filepath.Join(dir, "python3-input")
	pythonInput := filepath.Join(dir, "python-input")
	t.Setenv("PATH", dir)
	t.Setenv("TEST_PYTHON_LOG", log)
	t.Setenv("TEST_PYTHON3_INPUT", python3Input)
	t.Setenv("TEST_PYTHON_INPUT", pythonInput)

	graph := graphdata.GraphData{Name: "retry-input", Nodes: []graphdata.Node{{ID: "node"}}}
	result, parsed, err := GenerateModel(graph, dir, dir)
	if err != nil || !parsed || result["status"] != "fallback" {
		t.Fatalf("GenerateModel() = %#v, %t, %v", result, parsed, err)
	}
	if got := readFakeLog(t, log); got != "python3\npython" {
		t.Fatalf("interpreter calls = %q, want one call to each interpreter", got)
	}
	first, err := os.ReadFile(python3Input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := os.ReadFile(pythonInput)
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(second) || !strings.Contains(string(second), "retry-input") {
		t.Fatalf("retry input was not resent: first=%q second=%q", first, second)
	}
}

func TestGenerateModelReportsBothInterpreterFailures(t *testing.T) {
	dir := installFakePython(t, map[string]string{
		"python3": "#!/bin/sh\necho python3-failure >&2\nexit 1\n",
		"python":  "#!/bin/sh\necho python-failure >&2\nexit 1\n",
	})
	t.Setenv("PATH", dir)

	_, _, err := GenerateModel(graphdata.GraphData{Name: "failure"}, dir, dir)
	if err == nil || !strings.Contains(err.Error(), "python3-failure") || !strings.Contains(err.Error(), "python-failure") {
		t.Fatalf("generation error = %v", err)
	}
}

func installFakePython(t *testing.T, scripts map[string]string) string {
	t.Helper()
	requireUnixShellFake(t)
	dir := t.TempDir()
	for name, script := range scripts {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte(script), 0755); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func readFakeLog(t *testing.T, path string) string {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(string(contents))
}
