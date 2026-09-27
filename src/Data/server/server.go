// Package server exposes workspace-scoped Data mode documents and jobs.
package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"web-app/Canvas/handler"
	"web-app/Canvas/utils/python"
	"web-app/studio"
	"web-app/utils/paths"
)

const maxRequest = 8 << 20

var jobs = struct {
	sync.Mutex
	running map[string]*exec.Cmd
	queued  map[string]bool
	gate    chan struct{}
}{running: map[string]*exec.Cmd{}, queued: map[string]bool{}, gate: make(chan struct{}, 1)}

func Page(w http.ResponseWriter, r *http.Request) {
	studio.ServeTemplate(w, r, paths.Source("Data", "templates", "data.html"))
}

func RegisterAPI(mux *http.ServeMux) {
	mux.HandleFunc("/blocks", blocks)
	mux.HandleFunc("/datasets", datasets)
	mux.HandleFunc("/datasets/", datasets)
	mux.HandleFunc("/pipelines", pipelines)
	mux.HandleFunc("/code/parse", parseCode)
	mux.HandleFunc("/runs", runs)
	mux.HandleFunc("/runs/", run)
}

func fail(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func body(r *http.Request) (map[string]interface{}, error) {
	if r.Body == nil || r.ContentLength == 0 {
		return map[string]interface{}{}, nil
	}
	var request map[string]interface{}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxRequest+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > maxRequest {
		return nil, fmt.Errorf("request exceeds %d bytes", maxRequest)
	}
	if err := json.Unmarshal(raw, &request); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	return request, nil
}

func call(request map[string]interface{}) (map[string]interface{}, error) {
	request["workspace"] = handler.WorkspaceDir()
	input, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	script := paths.Source("Data", "utils", "service.py")
	out, err := python.RunCodeTool(script, filepath.Dir(script), "service", string(input), 30*time.Second)
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal(out, &result); err != nil {
		return nil, fmt.Errorf("invalid data service response: %w", err)
	}
	if ok, _ := result["ok"].(bool); !ok {
		return nil, fmt.Errorf("%v", result["error"])
	}
	delete(result, "ok")
	return result, nil
}

func respond(w http.ResponseWriter, request map[string]interface{}) {
	result, err := call(request)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "already exists") || strings.Contains(err.Error(), "changed externally") {
			status = http.StatusConflict
		}
		fail(w, status, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func blocks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		fail(w, 405, fmt.Errorf("method not allowed"))
		return
	}
	respond(w, map[string]interface{}{"action": "blocks"})
}

func datasets(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/datasets" {
		if r.Method == http.MethodGet {
			respond(w, map[string]interface{}{"action": "datasets"})
			return
		}
		if r.Method == http.MethodPost {
			request, err := body(r)
			if err != nil {
				fail(w, 400, err)
				return
			}
			request["action"] = "create"
			respond(w, request)
			return
		}
	}
	request, err := body(r)
	if err != nil {
		fail(w, 400, err)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 2 {
		fail(w, 404, fmt.Errorf("not found"))
		return
	}
	request["folder"] = parts[1]
	if len(parts) == 3 && parts[2] == "sources" {
		request["action"] = "sources"
	} else if len(parts) == 3 && parts[2] == "history" {
		request["action"] = "history"
		jobs.Lock()
		active := make([]string, 0, len(jobs.running)+len(jobs.queued))
		for id := range jobs.running {
			active = append(active, id)
		}
		for id := range jobs.queued {
			active = append(active, id)
		}
		jobs.Unlock()
		request["activeRuns"] = active
	} else if len(parts) == 3 && parts[2] == "bind" {
		request["action"] = "bind"
	} else {
		fail(w, 404, fmt.Errorf("not found"))
		return
	}
	respond(w, request)
}

func pipelines(w http.ResponseWriter, r *http.Request) {
	request, err := body(r)
	if err != nil {
		fail(w, 400, err)
		return
	}
	for _, key := range []string{"folder", "pipeline", "module"} {
		if value := r.URL.Query().Get(key); value != "" {
			request[key] = value
		}
	}
	switch r.Method {
	case http.MethodGet:
		if request["module"] != nil {
			request["action"] = "customRead"
		} else {
			request["action"] = "load"
		}
	case http.MethodPut:
		if request["module"] != nil {
			request["action"] = "customSave"
		} else {
			request["action"] = "save"
		}
	case http.MethodPost:
		if draft, _ := request["draft"].(bool); draft {
			request["action"] = "draft"
		} else if _, ok := request["source"]; ok {
			request["action"] = "parse"
		} else if _, ok := request["name"]; ok {
			request["action"] = "clone"
		} else {
			request["action"] = "draft"
		}
	default:
		fail(w, 405, fmt.Errorf("method not allowed"))
		return
	}
	respond(w, request)
}

func parseCode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, 405, fmt.Errorf("method not allowed"))
		return
	}
	request, err := body(r)
	if err != nil {
		fail(w, 400, err)
		return
	}
	request["action"] = "parse"
	respond(w, request)
}

func loopback(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	return err == nil && net.ParseIP(host).IsLoopback()
}

func runs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, 405, fmt.Errorf("method not allowed"))
		return
	}
	if !loopback(r) {
		fail(w, 403, fmt.Errorf("data execution is restricted to this computer"))
		return
	}
	request, err := body(r)
	if err != nil {
		fail(w, 400, err)
		return
	}
	if handler.WorkspaceDir() == "" {
		fail(w, 400, fmt.Errorf("select a workspace first"))
		return
	}
	snapshot, err := call(map[string]interface{}{"action": "snapshot", "folder": request["folder"], "pipeline": request["pipeline"]})
	if err != nil {
		fail(w, http.StatusBadRequest, err)
		return
	}
	request["snapshot"] = snapshot["snapshot"]
	idBytes := make([]byte, 16)
	if _, err := rand.Read(idBytes); err != nil {
		fail(w, 500, err)
		return
	}
	id := hex.EncodeToString(idBytes)
	request["runId"], request["workspace"] = id, handler.WorkspaceDir()
	if _, err := call(map[string]interface{}{"action": "runState", "folder": request["folder"], "runId": id, "pipeline": request["pipeline"], "status": "queued"}); err != nil {
		fail(w, http.StatusInternalServerError, err)
		return
	}
	jobs.Lock()
	jobs.queued[id] = true
	jobs.Unlock()
	go execute(id, request)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "status": "queued"})
}

func execute(id string, request map[string]interface{}) {
	jobs.gate <- struct{}{}
	defer func() { <-jobs.gate }()
	jobs.Lock()
	if !jobs.queued[id] {
		jobs.Unlock()
		return
	}
	jobs.Unlock()
	input, _ := json.Marshal(request)
	workspace := request["workspace"].(string)
	folder, _ := request["folder"].(string)
	runDir := filepath.Join(workspace, folder, "runs", id)
	if err := os.MkdirAll(runDir, 0700); err != nil {
		return
	}
	requestPath := filepath.Join(runDir, "request.json")
	if err := os.WriteFile(requestPath, input, 0600); err != nil {
		return
	}
	logFile, err := os.OpenFile(filepath.Join(runDir, "runner.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer logFile.Close()
	script := paths.Source("Data", "utils", "runner.py")
	cmd, err := python.StartTool(script, filepath.Dir(script), []string{requestPath}, logFile, logFile)
	jobs.Lock()
	delete(jobs.queued, id)
	if err == nil {
		jobs.running[id] = cmd
	}
	jobs.Unlock()
	if err != nil {
		_, _ = logFile.WriteString(err.Error())
		_, _ = call(map[string]interface{}{"action": "runState", "folder": folder, "runId": id, "pipeline": request["pipeline"], "status": "failed", "error": err.Error(), "completed": time.Now().Unix()})
		return
	}
	waitErr := cmd.Wait()
	jobs.Lock()
	delete(jobs.running, id)
	jobs.Unlock()
	if waitErr != nil {
		result, statusErr := call(map[string]interface{}{"action": "runStatus", "folder": folder, "runId": id})
		state := ""
		if runStatus, ok := result["run"].(map[string]interface{}); ok {
			state, _ = runStatus["status"].(string)
		}
		if statusErr != nil || state == "queued" || state == "running" {
			_, _ = call(map[string]interface{}{"action": "runState", "folder": folder, "runId": id, "pipeline": request["pipeline"], "status": "failed", "error": waitErr.Error(), "completed": time.Now().Unix()})
		}
	}
}

func run(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 2 {
		fail(w, 404, fmt.Errorf("not found"))
		return
	}
	id := parts[1]
	request, err := body(r)
	if err != nil && r.Method != http.MethodGet {
		fail(w, 400, err)
		return
	}
	folder := r.URL.Query().Get("folder")
	if value, ok := request["folder"].(string); ok {
		folder = value
	}
	if len(parts) == 3 && parts[2] == "cancel" && r.Method == http.MethodPost {
		jobs.Lock()
		cmd := jobs.running[id]
		queued := jobs.queued[id]
		if queued {
			delete(jobs.queued, id)
		}
		jobs.Unlock()
		if cmd == nil && !queued {
			fail(w, 409, fmt.Errorf("run is not active"))
			return
		}
		if cmd != nil {
			kill(cmd)
		}
		respond(w, map[string]interface{}{"action": "runState", "folder": folder, "runId": id, "status": "cancelled", "completed": time.Now().Unix()})
		return
	}
	if r.Method != http.MethodGet {
		fail(w, 405, fmt.Errorf("method not allowed"))
		return
	}
	jobs.Lock()
	queued := jobs.queued[id]
	jobs.Unlock()
	if queued {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"run": map[string]interface{}{"id": id, "status": "queued"}})
		return
	}
	respond(w, map[string]interface{}{"action": "runStatus", "folder": folder, "runId": id})
}

func kill(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	if runtime.GOOS == "windows" {
		_ = exec.Command("taskkill", "/PID", fmt.Sprint(cmd.Process.Pid), "/T", "/F").Run()
	} else {
		_ = cmd.Process.Kill()
	}
}
