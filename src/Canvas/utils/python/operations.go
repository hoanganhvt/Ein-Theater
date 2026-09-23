package python

import (
	"encoding/json"
	"fmt"
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
	run := func(candidate Candidate) ([]byte, error) {
		cmd := command(candidate, cmdArgs...)
		// Build a reader per attempt because the first process consumes its input.
		cmd.Stdin = strings.NewReader(string(canvasBytes))
		return cmd.CombinedOutput()
	}

	var out []byte
	var failures []string
	for _, candidate := range candidates() {
		out, err = run(candidate)
		if err == nil {
			break
		}
		failures = append(failures, fmt.Sprintf("%s: %v: %s", candidate.Executable, err, string(out)))
	}
	if err != nil {
		return nil, false, fault.Internal(fmt.Sprintf("%v: Python model generation error (%s)", ErrUnavailable, strings.Join(failures, "; ")))
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
