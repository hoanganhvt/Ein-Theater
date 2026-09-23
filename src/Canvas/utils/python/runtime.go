package python

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

var ErrUnavailable = errors.New("python_unavailable")

type Candidate struct {
	Executable string   `json:"executable"`
	Args       []string `json:"args,omitempty"`
}

type RuntimeStatus struct {
	Available     bool   `json:"available"`
	Executable    string `json:"executable,omitempty"`
	PythonVersion string `json:"pythonVersion,omitempty"`
	TorchVersion  string `json:"torchVersion,omitempty"`
	Error         string `json:"error,omitempty"`
}

var runtimeConfig struct {
	sync.Mutex
	dataDir   string
	preferred *Candidate
	status    RuntimeStatus
}

func Configure(dataDir string) {
	runtimeConfig.Lock()
	defer runtimeConfig.Unlock()
	runtimeConfig.dataDir = dataDir
	runtimeConfig.preferred = nil
	if dataDir == "" {
		return
	}
	raw, err := os.ReadFile(filepath.Join(dataDir, "python-v1.json"))
	if err == nil {
		var candidate Candidate
		if json.Unmarshal(raw, &candidate) == nil && candidate.Executable != "" {
			runtimeConfig.preferred = &candidate
		}
	}
}

func defaultCandidates() []Candidate {
	if runtime.GOOS == "windows" {
		return []Candidate{{Executable: "py", Args: []string{"-3"}}, {Executable: "python"}, {Executable: "python3"}}
	}
	return []Candidate{{Executable: "python3"}, {Executable: "python"}}
}

func candidates() []Candidate {
	runtimeConfig.Lock()
	defer runtimeConfig.Unlock()
	if runtimeConfig.preferred != nil {
		return []Candidate{*runtimeConfig.preferred}
	}
	return defaultCandidates()
}

func command(candidate Candidate, args ...string) *exec.Cmd {
	all := append(append([]string(nil), candidate.Args...), args...)
	cmd := exec.Command(candidate.Executable, all...)
	cmd.Env = processEnvironment()
	return cmd
}

func validate(candidate Candidate) RuntimeStatus {
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	code := "import sys, torch; print(sys.version.split()[0] + '\\t' + torch.__version__)"
	args := append(append([]string(nil), candidate.Args...), "-c", code)
	cmd := exec.CommandContext(ctx, candidate.Executable, args...)
	cmd.Env = processEnvironment()
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return RuntimeStatus{Error: "Python validation timed out"}
	}
	if err != nil {
		message := strings.TrimSpace(string(out))
		if message == "" {
			message = err.Error()
		}
		return RuntimeStatus{Error: message}
	}
	parts := strings.SplitN(strings.TrimSpace(string(out)), "\t", 2)
	status := RuntimeStatus{Available: true, Executable: candidate.Executable}
	if len(parts) > 0 {
		status.PythonVersion = parts[0]
	}
	if len(parts) > 1 {
		status.TorchVersion = parts[1]
	}
	return status
}

// Detect returns the first interpreter that can import PyTorch.
func Detect() RuntimeStatus {
	var last RuntimeStatus
	for _, candidate := range candidates() {
		status := validate(candidate)
		if status.Available {
			runtimeConfig.Lock()
			runtimeConfig.preferred = &candidate
			runtimeConfig.status = status
			runtimeConfig.Unlock()
			return status
		}
		last = status
	}
	if last.Error == "" {
		last.Error = "Python 3 with PyTorch was not found"
	}
	runtimeConfig.Lock()
	runtimeConfig.status = last
	runtimeConfig.Unlock()
	return last
}

// SetExecutable validates and persists a user-selected python.exe.
func SetExecutable(path string) (RuntimeStatus, error) {
	path = filepath.Clean(strings.TrimSpace(path))
	if path == "" {
		return RuntimeStatus{}, fmt.Errorf("%w: executable path is required", ErrUnavailable)
	}
	candidate := Candidate{Executable: path}
	status := validate(candidate)
	if !status.Available {
		return status, fmt.Errorf("%w: %s", ErrUnavailable, status.Error)
	}
	runtimeConfig.Lock()
	runtimeConfig.preferred = &candidate
	runtimeConfig.status = status
	dataDir := runtimeConfig.dataDir
	runtimeConfig.Unlock()
	if dataDir != "" {
		if err := os.MkdirAll(dataDir, 0700); err != nil {
			return status, err
		}
		raw, _ := json.MarshalIndent(candidate, "", "  ")
		if err := os.WriteFile(filepath.Join(dataDir, "python-v1.json"), raw, 0600); err != nil {
			return status, err
		}
	}
	StopWorker()
	return status, nil
}

func unavailableError(status RuntimeStatus) error {
	message := status.Error
	if message == "" {
		message = "Python 3 with PyTorch was not found. Configure python.exe in Ein Theater."
	}
	return fmt.Errorf("%w: %s", ErrUnavailable, message)
}
