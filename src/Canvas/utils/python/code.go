package python

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// RunCodeTool uses the configured Python interpreter and bounds source execution.
func RunCodeTool(script, workDir, mode, input string, timeout time.Duration) ([]byte, error) {
	var failures []string
	for _, candidate := range candidates() {
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		args := append(append([]string(nil), candidate.Args...), "-B", script, mode)
		cmd := exec.CommandContext(ctx, candidate.Executable, args...)
		cmd.Dir = workDir
		cmd.Env = processEnvironment()
		cmd.Stdin = strings.NewReader(input)
		out, err := cmd.Output()
		cancel()
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("Python %s timed out after %s", mode, timeout)
		}
		if err == nil {
			return out, nil
		}
		detail := err.Error()
		if exit, ok := err.(*exec.ExitError); ok && len(exit.Stderr) > 0 {
			detail = strings.TrimSpace(string(exit.Stderr))
		}
		failures = append(failures, fmt.Sprintf("%s: %s", candidate.Executable, detail))
		// A started interpreter can report a valid JSON error result; do not try another.
		if _, ok := err.(*exec.ExitError); ok {
			if strings.Contains(detail, "No installed Python found") {
				continue
			}
			return nil, fmt.Errorf("Python %s failed: %s", mode, detail)
		}
	}
	return nil, fmt.Errorf("%w: %s", ErrUnavailable, strings.Join(failures, "; "))
}
