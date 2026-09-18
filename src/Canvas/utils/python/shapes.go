// Package python coordinates Python shape analysis and model generation.
// See document.md for component inputs, outputs, and test instructions.
package python

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
	graphdata "web-app/Canvas/utils/graph"
)

// Python owns all shape rules. This bridge keeps one interpreter alive and
// bounds worker execution time; it never holds the project mutex during IO.
type pythonShapeWorker struct {
	mu     sync.Mutex
	cmd    *exec.Cmd
	input  io.WriteCloser
	output *bufio.Reader
}

var shapeWorker pythonShapeWorker

func (w *pythonShapeWorker) stop() {
	if w.cmd != nil {
		_ = w.input.Close()
		_ = w.cmd.Process.Kill()
		_ = w.cmd.Wait()
	}
	w.cmd = nil
}

func (w *pythonShapeWorker) analyze(graph graphdata.GraphData, baseDir string) (graphdata.GraphData, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.cmd == nil {
		path := filepath.Join(filepath.Dir(FindGenCodePyPath()), "..", "auto_shape_fitting", "shape_inference.py")
		cmd := exec.Command("python", "-u", path, "--worker")
		cmd.Env = append(os.Environ(), "PYTHONDONTWRITEBYTECODE=1")
		input, err := cmd.StdinPipe()
		if err != nil {
			return graphdata.GraphData{}, err
		}
		output, err := cmd.StdoutPipe()
		if err != nil {
			_ = input.Close()
			return graphdata.GraphData{}, err
		}
		cmd.Stderr = os.Stderr
		if err = cmd.Start(); err != nil {
			_ = input.Close()
			_ = output.Close()
			return graphdata.GraphData{}, err
		}
		w.cmd = cmd
		w.input = input
		w.output = bufio.NewReader(output)
	}
	request := struct {
		Graph   graphdata.GraphData `json:"graph"`
		BaseDir string              `json:"baseDir"`
	}{graph, baseDir}
	type response struct {
		data []byte
		err  error
	}
	done := make(chan response, 1)
	// Keep local pipe references; timed-out workers may be replaced on the next request.
	input, output := w.input, w.output
	go func() {
		if err := json.NewEncoder(input).Encode(request); err != nil {
			done <- response{err: err}
			return
		}
		data, err := output.ReadBytes('\n')
		done <- response{data, err}
	}()
	select {
	case result := <-done:
		if result.err != nil {
			w.stop()
			return graphdata.GraphData{}, fmt.Errorf("Python shape worker: %w", result.err)
		}
		var payload struct {
			Graph graphdata.GraphData `json:"graph"`
			Error string              `json:"error"`
		}
		if err := json.Unmarshal(result.data, &payload); err != nil {
			w.stop()
			return graphdata.GraphData{}, fmt.Errorf("Python shape response: %w", err)
		}
		if payload.Error != "" {
			return graphdata.GraphData{}, fmt.Errorf("%s", payload.Error)
		}
		return payload.Graph, nil
	case <-time.After(45 * time.Second):
		w.stop()
		return graphdata.GraphData{}, fmt.Errorf("Python shape analysis timed out after 45 seconds")
	}
}

// AnalyzeGraph runs a detached graph through the shared worker, bypassing empty graphs.
func AnalyzeGraph(graph graphdata.GraphData, baseDir string) (graphdata.GraphData, error) {
	if len(graph.Nodes) == 0 {
		return graph, nil
	}
	return shapeWorker.analyze(graph, baseDir)
}
