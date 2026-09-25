package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	canvas "web-app/Canvas/handler"
)

func setupWorkspace(t *testing.T) string {
	t.Helper()
	dir, err := os.MkdirTemp(".", "code-test-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	dir, err = filepath.Abs(dir)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/workspace/set?path="+dir, nil)
	w := httptest.NewRecorder()
	canvas.SetWorkspaceHandler(w, request)
	if w.Code != 200 {
		t.Fatalf("set workspace: %d %s", w.Code, w.Body.String())
	}
	return dir
}

func serve(method, path string, body any) *httptest.ResponseRecorder {
	var raw []byte
	if body != nil {
		raw, _ = json.Marshal(body)
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(raw))
	w := httptest.NewRecorder()
	mux := http.NewServeMux()
	RegisterAPI(mux)
	mux.ServeHTTP(w, r)
	return w
}

func TestFileLifecycleAndExternalConflict(t *testing.T) {
	dir := setupWorkspace(t)
	w := serve(http.MethodPut, "/file", fileRequest{Path: "model.py", Source: "print(1)"})
	if w.Code != 200 {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	w = serve(http.MethodGet, "/file?path=model.py", nil)
	var opened struct{ Source, Hash string }
	if err := json.Unmarshal(w.Body.Bytes(), &opened); err != nil || opened.Source != "print(1)" || opened.Hash == "" {
		t.Fatalf("open: %d %s", w.Code, w.Body.String())
	}
	if err := os.WriteFile(filepath.Join(dir, "model.py"), []byte("external"), 0600); err != nil {
		t.Fatal(err)
	}
	w = serve(http.MethodPut, "/file", fileRequest{Path: "model.py", Source: "print(2)", ExpectedHash: opened.Hash})
	if w.Code != 409 {
		t.Fatalf("expected conflict: %d", w.Code)
	}
	w = serve(http.MethodDelete, "/file", fileRequest{Path: "model.py", ExpectedHash: opened.Hash})
	if w.Code != 409 {
		t.Fatalf("expected delete conflict: %d", w.Code)
	}
	w = serve(http.MethodGet, "/file?path=model.py", nil)
	_ = json.Unmarshal(w.Body.Bytes(), &opened)
	w = serve(http.MethodDelete, "/file", fileRequest{Path: "model.py", ExpectedHash: opened.Hash})
	if w.Code != 200 {
		t.Fatalf("delete: %d %s", w.Code, w.Body.String())
	}
}

func TestRejectOutsideWorkspace(t *testing.T) {
	setupWorkspace(t)
	for _, path := range []string{"../secret.py", "C:/secret.py", "/Windows/secret.py", "model.txt"} {
		w := serve(http.MethodPut, "/file", fileRequest{Path: path, Source: "x"})
		if w.Code != 400 {
			t.Fatalf("path %q: %d", path, w.Code)
		}
	}
}

func TestActiveProjectDraftSwitchesWithoutSavingOrCompiling(t *testing.T) {
	dir := setupWorkspace(t)
	w := serve(http.MethodPost, "/active/bind", map[string]string{"path": "draft.py"})
	if w.Code != 200 {
		t.Fatalf("bind: %d %s", w.Code, w.Body.String())
	}
	var bound struct {
		ProjectID string `json:"projectId"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &bound)
	if bound.ProjectID == "" {
		t.Fatal("missing active project")
	}
	w = serve(http.MethodPut, "/active", activeRequest{ProjectID: bound.ProjectID, Path: "draft.py", Source: "edited in Code"})
	if w.Code != 200 {
		t.Fatalf("draft: %d %s", w.Code, w.Body.String())
	}
	if _, err := os.Stat(filepath.Join(dir, "draft.py")); !os.IsNotExist(err) {
		t.Fatalf("draft was written to disk: %v", err)
	}
	w = serve(http.MethodGet, "/active", nil)
	var active struct{ ProjectID, Path, Source string }
	_ = json.Unmarshal(w.Body.Bytes(), &active)
	if active.ProjectID != bound.ProjectID || active.Path != "draft.py" || active.Source != "edited in Code" {
		t.Fatalf("active Code project changed: %+v", active)
	}
	w = serve(http.MethodPost, "/active/bind", map[string]string{"path": "second.py"})
	if w.Code != 200 {
		t.Fatalf("second bind: %d %s", w.Code, w.Body.String())
	}
	w = serve(http.MethodPost, "/active/bind", map[string]string{"path": "draft.py"})
	if w.Code != 200 {
		t.Fatalf("reopen: %d %s", w.Code, w.Body.String())
	}
	w = serve(http.MethodGet, "/active", nil)
	_ = json.Unmarshal(w.Body.Bytes(), &active)
	if active.ProjectID != bound.ProjectID || active.Source != "edited in Code" {
		t.Fatalf("draft was lost: %+v", active)
	}
}

func TestCanvasOnlyProjectKeepsCodeDraftWithoutFile(t *testing.T) {
	w := httptest.NewRecorder()
	canvas.CreateProjectHandler(w, httptest.NewRequest(http.MethodPost, "/api/projects/create?name=CanvasOnly", nil))
	if w.Code != 200 {
		t.Fatalf("create project: %d %s", w.Code, w.Body.String())
	}
	var project struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &project)
	w = serve(http.MethodPut, "/active", activeRequest{ProjectID: project.ID, Source: "draft without file"})
	if w.Code != 200 {
		t.Fatalf("draft: %d %s", w.Code, w.Body.String())
	}
	w = serve(http.MethodGet, "/active", nil)
	var active struct{ ProjectID, Path, Source string }
	_ = json.Unmarshal(w.Body.Bytes(), &active)
	if active.ProjectID != project.ID || active.Path != "" || active.Source != "draft without file" {
		t.Fatalf("blank-file draft was lost: %+v", active)
	}
}
