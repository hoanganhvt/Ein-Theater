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
	"strings"
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
	cmd := w.cmd
	input := w.input
	w.cmd = nil
	w.input = nil
	w.output = nil
	if cmd == nil {
		return
	}
	if input != nil {
		_ = input.Close()
	}
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	_ = cmd.Wait()
}

func (w *pythonShapeWorker) start(candidate Candidate, path string) error {
	cmd := command(candidate, "-u", path, "--worker")
	input, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	output, err := cmd.StdoutPipe()
	if err != nil {
		_ = input.Close()
		return err
	}
	cmd.Stderr = os.Stderr
	if err = cmd.Start(); err != nil {
		_ = input.Close()
		_ = output.Close()
		return err
	}
	w.cmd = cmd
	w.input = input
	w.output = bufio.NewReader(output)
	return nil
}

type shapeWorkerExchange struct {
	graph    graphdata.GraphData
	err      error
	valid    bool
	timedOut bool
}

type shapeWorkerRequest struct {
	Graph   graphdata.GraphData `json:"graph"`
	BaseDir string              `json:"baseDir"`
}

func (w *pythonShapeWorker) exchange(request shapeWorkerRequest) shapeWorkerExchange {
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
	timer := time.NewTimer(45 * time.Second)
	defer timer.Stop()
	select {
	case result := <-done:
		if result.err != nil {
			return shapeWorkerExchange{err: fmt.Errorf("Python shape worker: %w", result.err)}
		}
		var payload struct {
			Graph *graphdata.GraphData `json:"graph"`
			Error *string              `json:"error"`
		}
		if err := json.Unmarshal(result.data, &payload); err != nil {
			return shapeWorkerExchange{err: fmt.Errorf("Python shape response: %w", err)}
		}
		if payload.Error != nil {
			return shapeWorkerExchange{err: fmt.Errorf("%s", *payload.Error), valid: true}
		}
		if payload.Graph == nil {
			return shapeWorkerExchange{err: fmt.Errorf("Python shape response: missing graph or error")}
		}
		return shapeWorkerExchange{graph: *payload.Graph, valid: true}
	case <-timer.C:
		return shapeWorkerExchange{err: fmt.Errorf("Python shape analysis timed out after 45 seconds"), timedOut: true}
	}
}

func (w *pythonShapeWorker) analyze(graph graphdata.GraphData, baseDir string) (graphdata.GraphData, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	path := filepath.Join(filepath.Dir(FindGenCodePyPath()), "..", "auto_shape_fitting", "shape_inference.py")
	request := shapeWorkerRequest{Graph: graph, BaseDir: baseDir}
	if w.cmd != nil {
		result := w.exchange(request)
		if result.err == nil {
			return result.graph, nil
		}
		if result.valid {
			return graphdata.GraphData{}, result.err
		}
		w.stop()
	}

	var failures []string
	for _, candidate := range candidates() {
		if err := w.start(candidate, path); err != nil {
			failures = append(failures, fmt.Sprintf("%s start: %v", candidate.Executable, err))
			continue
		}
		result := w.exchange(request)
		if result.err == nil {
			return result.graph, nil
		}
		if result.valid {
			return graphdata.GraphData{}, result.err
		}
		failures = append(failures, fmt.Sprintf("%s: %v", candidate.Executable, result.err))
		w.stop()
		if result.timedOut {
			break
		}
	}
	return graphdata.GraphData{}, fmt.Errorf("%w: Python shape worker failed (%s)", ErrUnavailable, strings.Join(failures, "; "))
}

// AnalyzeGraph runs a detached graph through the shared worker, bypassing empty graphs.
func AnalyzeGraph(graph graphdata.GraphData, baseDir string) (graphdata.GraphData, error) {
	if len(graph.Nodes) == 0 {
		return graph, nil
	}
	return shapeWorker.analyze(graph, baseDir)
}

// StopWorker releases the long-lived Python process during reconfiguration or shutdown.
func StopWorker() {
	shapeWorker.mu.Lock()
	defer shapeWorker.mu.Unlock()
	shapeWorker.stop()
}
