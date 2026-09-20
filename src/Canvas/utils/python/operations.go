package python

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"web-app/Canvas/utils/fault"
	"web-app/Canvas/utils/graph"
)

// GenerateModel writes the model through Python. The boolean indicates a parsed JSON response.
func GenerateModel(graphPayload graph.GraphData, cleanTarget, baseDir string) (map[string]interface{}, bool, error) {
	canvasBytes, err := json.Marshal(graphPayload)
	if err != nil {
		return nil, false, fault.Internal("Failed to serialize canvas data: " + err.Error())
	}

	genCodePyPath := FindGenCodePyPath()
	cmdArgs := []string{genCodePyPath, "--save-canvas", "-", "--out-dir", cleanTarget, "--base-dir", baseDir}
	run := func(interpreter string) ([]byte, error) {
		cmd := exec.Command(interpreter, cmdArgs...)
		cmd.Env = processEnvironment()
		// Build a reader per attempt because the first process consumes its input.
		cmd.Stdin = strings.NewReader(string(canvasBytes))
		return cmd.CombinedOutput()
	}

	out, err := run("python3")
	if err != nil {
		python3Err, python3Out := err, out
		out, err = run("python")
		if err != nil {
			return nil, false, fault.Internal(fmt.Sprintf("Python model generation error (python3: %v: %s; python: %v: %s)", python3Err, string(python3Out), err, string(out)))
		}
	}

	outStr := strings.TrimSpace(string(out))
	var result map[string]interface{}
	if jsonErr := json.Unmarshal([]byte(outStr), &result); jsonErr != nil {
		return map[string]interface{}{
			"status": "ok",
			"raw":    outStr,
			"folder": filepath.Join(cleanTarget, graphPayload.Name),
		}, false, nil
	}

	return result, true, nil
}
