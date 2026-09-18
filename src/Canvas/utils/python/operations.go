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
	cmd := exec.Command("python", cmdArgs...)
	cmd.Env = processEnvironment()
	cmd.Stdin = strings.NewReader(string(canvasBytes))
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, false, fault.Internal(fmt.Sprintf("Python model generation error (%v): %s", err, string(out)))
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
