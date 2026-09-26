package server

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"web-app/Canvas/handler"
	"web-app/Canvas/utils/graph"
	"web-app/Canvas/utils/python"
	"web-app/studio"
	"web-app/utils/paths"
)

const maxSource = 1024 * 1024

func Page(w http.ResponseWriter, r *http.Request) {
	studio.ServeTemplate(w, r, paths.Source("Code", "templates", "code.html"))
}

func RegisterAPI(mux *http.ServeMux) {
	mux.HandleFunc("/files", files)
	mux.HandleFunc("/file", file)
	mux.HandleFunc("/classes", classes)
	mux.HandleFunc("/compile", compile)
	mux.HandleFunc("/active", active)
	mux.HandleFunc("/active/bind", bindActive)
}

func fail(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func workspace() (string, error) {
	dir := handler.WorkspaceDir()
	if dir == "" {
		return "", errors.New("select a workspace folder first")
	}
	return filepath.Abs(dir)
}

func codePath(relative string, mustExist bool) (string, string, error) {
	root, err := workspace()
	if err != nil {
		return "", "", err
	}
	if filepath.IsAbs(relative) || filepath.VolumeName(relative) != "" || filepath.Ext(relative) != ".py" || relative == "" {
		return "", "", errors.New("a relative .py path is required")
	}
	clean := filepath.Clean(relative)
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", "", errors.New("path is outside the workspace")
	}
	full := filepath.Join(root, clean)
	if rel, err := filepath.Rel(root, full); err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", "", errors.New("path is outside the workspace")
	}
	// Reject symlinks and junctions in every component below the selected root.
	current := root
	parts := strings.Split(clean, string(filepath.Separator))
	for i, part := range parts {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			if i == len(parts)-1 && !mustExist && os.IsNotExist(err) {
				break
			}
			return "", "", err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", "", errors.New("symlink paths are not allowed")
		}
		if i < len(parts)-1 && !info.IsDir() {
			return "", "", errors.New("parent is not a directory")
		}
	}
	return full, clean, nil
}

func hash(data []byte) string { value := sha256.Sum256(data); return hex.EncodeToString(value[:]) }

func files(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		fail(w, 405, "method not allowed")
		return
	}
	root, err := workspace()
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	list := []string{}
	modelFiles := handler.ModelCodePaths()
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if strings.HasPrefix(entry.Name(), ".") && path != root {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 || filepath.Ext(path) != ".py" || modelFiles[path] {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err == nil {
			list = append(list, rel)
		}
		return err
	})
	if err != nil {
		fail(w, 500, err.Error())
		return
	}
	sort.Strings(list)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"files": list})
}

type fileRequest struct {
	Path         string `json:"path"`
	Source       string `json:"source"`
	ExpectedHash string `json:"expectedHash"`
}

func file(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPut && r.Method != http.MethodDelete {
		fail(w, 405, "method not allowed")
		return
	}
	var req fileRequest
	if r.Method == http.MethodGet {
		req.Path = r.URL.Query().Get("path")
	} else {
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxSource+4096)).Decode(&req); err != nil {
			fail(w, 400, "invalid or oversized request")
			return
		}
	}
	full, relative, err := codePath(req.Path, r.Method != http.MethodPut)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	current, readErr := os.ReadFile(full)
	if r.Method == http.MethodGet {
		if readErr != nil {
			fail(w, 404, "file not found")
			return
		}
		if len(current) > maxSource {
			fail(w, 413, "file is too large")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"path": relative, "source": string(current), "hash": hash(current), "projectId": handler.CompiledProject(full)})
		return
	}
	if readErr == nil && (req.ExpectedHash == "" || req.ExpectedHash != hash(current)) {
		fail(w, 409, "file changed on disk; reload before saving or deleting")
		return
	}
	if readErr != nil && !os.IsNotExist(readErr) {
		fail(w, 500, readErr.Error())
		return
	}
	if readErr != nil && req.ExpectedHash != "" {
		fail(w, 409, "file was removed on disk")
		return
	}
	if r.Method == http.MethodDelete {
		if readErr != nil {
			fail(w, 404, "file not found")
			return
		}
		if err := os.Remove(full); err != nil {
			fail(w, 500, err.Error())
			return
		}
		handler.UnbindCodeDocument(full)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"deleted": true})
		return
	}
	if len(req.Source) > maxSource {
		fail(w, 413, "source is too large")
		return
	}
	if err := os.WriteFile(full, []byte(req.Source), 0600); err != nil {
		fail(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"path": relative, "hash": hash([]byte(req.Source))})
}

type codeRequest struct {
	Path      string `json:"path"`
	Source    string `json:"source"`
	ClassName string `json:"className"`
	Replace   bool   `json:"replace"`
}

func decodeCode(w http.ResponseWriter, r *http.Request) (codeRequest, bool) {
	if r.Method != http.MethodPost {
		fail(w, 405, "method not allowed")
		return codeRequest{}, false
	}
	var req codeRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxSource+4096)).Decode(&req); err != nil || len(req.Source) > maxSource {
		fail(w, 400, "invalid or oversized source")
		return req, false
	}
	return req, true
}

func runTool(mode string, req codeRequest, full string) (map[string]json.RawMessage, error) {
	input, _ := json.Marshal(map[string]string{"source": req.Source, "className": req.ClassName, "path": full})
	out, err := python.RunCodeTool(paths.Source("Code", "utils", "compile.py"), filepath.Dir(full), mode, string(input), 30*time.Second)
	if err != nil {
		return nil, err
	}
	var result map[string]json.RawMessage
	if err := json.Unmarshal(out, &result); err != nil {
		return nil, fmt.Errorf("invalid Python response: %w", err)
	}
	if raw := result["error"]; len(raw) > 0 {
		var message string
		_ = json.Unmarshal(raw, &message)
		return nil, errors.New(message)
	}
	return result, nil
}

func toolFailure(w http.ResponseWriter, err error) {
	if errors.Is(err, python.ErrUnavailable) || strings.Contains(err.Error(), "No module named 'torch'") {
		fail(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	fail(w, http.StatusUnprocessableEntity, err.Error())
}

func classes(w http.ResponseWriter, r *http.Request) {
	req, ok := decodeCode(w, r)
	if !ok {
		return
	}
	full, _, err := codePath(req.Path, false)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	result, err := runTool("classes", req, full)
	if err != nil {
		toolFailure(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func compile(w http.ResponseWriter, r *http.Request) {
	req, ok := decodeCode(w, r)
	if !ok {
		return
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || !net.ParseIP(host).IsLoopback() {
		fail(w, 403, "compile is available only from this computer")
		return
	}
	if req.ClassName == "" {
		fail(w, 400, "select a model class")
		return
	}
	full, _, err := codePath(req.Path, false)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	if _, needsReplace := handler.CompileTarget(full); needsReplace && !req.Replace {
		fail(w, 409, "confirm replacement of the existing Canvas project")
		return
	}
	result, err := runTool("compile", req, full)
	if err != nil {
		toolFailure(w, err)
		return
	}
	var data graph.GraphData
	if err := json.Unmarshal(result["graph"], &data); err != nil {
		fail(w, 500, "invalid graph from Python")
		return
	}
	id, updated, err := handler.ImportCompiledGraph(full, data, req.Replace)
	if err != nil {
		if errors.Is(err, handler.ErrCompiledProjectExists) {
			fail(w, 409, err.Error())
		} else {
			fail(w, 422, err.Error())
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"projectId": id, "updated": updated, "nodeCount": len(data.Nodes), "edgeCount": len(data.Edges)})
}

type activeRequest struct {
	ProjectID   string `json:"projectId"`
	Path        string `json:"path"`
	Source      string `json:"source"`
	SavedSource string `json:"savedSource"`
	Hash        string `json:"hash"`
}

func active(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPut {
		var req activeRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2*maxSource+4096)).Decode(&req); err != nil || len(req.Source) > maxSource || len(req.SavedSource) > maxSource {
			fail(w, 400, "invalid or oversized Code draft")
			return
		}
		full := ""
		if req.Path != "" {
			var err error
			full, _, err = codePath(req.Path, false)
			if err != nil {
				fail(w, 400, err.Error())
				return
			}
		}
		if err := handler.SetCodeDocument(req.ProjectID, full, req.Source, req.SavedSource, req.Hash); err != nil {
			fail(w, 409, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"synced": true})
		return
	}
	if r.Method != http.MethodGet {
		fail(w, 405, "method not allowed")
		return
	}
	doc := handler.ActiveCodeDocument()
	relative := ""
	if doc.Path != "" {
		root, err := workspace()
		if err == nil {
			rel, err := filepath.Rel(root, doc.Path)
			if err == nil {
				if full, clean, err := codePath(rel, false); err == nil && full == doc.Path {
					relative = clean
				}
			}
		}
	}
	if relative == "" && doc.Path != "" {
		doc.Source, doc.SavedSource, doc.Hash, doc.DraftSet = "", "", "", false
	} else if !doc.DraftSet {
		raw, err := os.ReadFile(doc.Path)
		if err == nil && len(raw) <= maxSource {
			doc.Source, doc.SavedSource, doc.Hash = string(raw), string(raw), hash(raw)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"projectId": doc.ProjectID, "projectName": doc.ProjectName, "path": relative, "source": doc.Source,
		"savedSource": doc.SavedSource, "hash": doc.Hash,
		"replaceRequired": doc.ReplaceRequired,
	})
}

func bindActive(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, 405, "method not allowed")
		return
	}
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		fail(w, 400, "invalid request")
		return
	}
	full, _, err := codePath(req.Path, false)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	doc := handler.BindCodeDocument(full)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"projectId": doc.ProjectID, "replaceRequired": doc.ReplaceRequired})
}
