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

func TestLoadedModelCodeAppearsOnlyInModels(t *testing.T) {
	root := setupWorkspace(t)
	folder := filepath.Join(root, "UNet")
	if err := os.Mkdir(folder, 0755); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{
		"UNet.json": `{"canvas":{"name":"UNet","nodes":[{"id":"input_0","layerType":"Input"}],"edges":[]}}`,
		"UNet.py":   "class UNet:\n    pass\n",
	} {
		if err := os.WriteFile(filepath.Join(folder, name), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "scratch.py"), []byte("pass\n"), 0600); err != nil {
		t.Fatal(err)
	}
	loaded := httptest.NewRecorder()
	body, _ := json.Marshal(map[string]string{"path": folder})
	canvas.LoadModelHandler(loaded, httptest.NewRequest(http.MethodPost, "/api/loadModel", bytes.NewReader(body)))
	if loaded.Code != 200 {
		t.Fatalf("load: %d %s", loaded.Code, loaded.Body.String())
	}
	var model struct {
		ProjectID string `json:"projectId"`
	}
	_ = json.Unmarshal(loaded.Body.Bytes(), &model)
	active := serve(http.MethodGet, "/active", nil)
	var doc struct{ ProjectID, Path, Source string }
	_ = json.Unmarshal(active.Body.Bytes(), &doc)
	if doc.ProjectID != model.ProjectID || doc.Path != filepath.Join("UNet", "UNet.py") || doc.Source != "class UNet:\n    pass\n" {
		t.Fatalf("model code: %d %s", active.Code, active.Body.String())
	}
	listed := serve(http.MethodGet, "/files", nil)
	var files struct {
		Files []string `json:"files"`
	}
	_ = json.Unmarshal(listed.Body.Bytes(), &files)
	if listed.Code != 200 || len(files.Files) != 1 || files.Files[0] != "scratch.py" {
		t.Fatalf("duplicate model file: %d %s", listed.Code, listed.Body.String())
	}
	bound := serve(http.MethodPost, "/active/bind", map[string]string{"path": filepath.Join("UNet", "UNet.py")})
	var reopened struct {
		ProjectID string `json:"projectId"`
	}
	_ = json.Unmarshal(bound.Body.Bytes(), &reopened)
	if bound.Code != 200 || reopened.ProjectID != model.ProjectID {
		t.Fatalf("binding model code created another project: %d %s", bound.Code, bound.Body.String())
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

func TestCodeModelSelectionUsesCanvasActiveProject(t *testing.T) {
	setupWorkspace(t)
	create := func(name string) string {
		w := httptest.NewRecorder()
		canvas.CreateProjectHandler(w, httptest.NewRequest(http.MethodPost, "/api/projects/create?name="+name, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("create %s: %d", name, w.Code)
		}
		var p struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
			t.Fatal(err)
		}
		return p.ID
	}
	a, b := create("ModelA"), create("ModelB")
	switchTo := func(id string) {
		w := httptest.NewRecorder()
		canvas.SwitchProjectHandler(w, httptest.NewRequest(http.MethodPost, "/api/projects/switch?id="+id, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("switch %s: %d", id, w.Code)
		}
	}
	switchTo(a)
	if w := serve(http.MethodPut, "/active", activeRequest{ProjectID: a, Source: "draft A"}); w.Code != http.StatusOK {
		t.Fatalf("draft A: %d", w.Code)
	}
	switchTo(b)
	w := serve(http.MethodGet, "/active", nil)
	var active struct{ ProjectID, Source string }
	if err := json.Unmarshal(w.Body.Bytes(), &active); err != nil {
		t.Fatal(err)
	}
	if active.ProjectID != b || active.Source != "" {
		t.Fatalf("Code did not follow B: %+v", active)
	}
	if w := serve(http.MethodPut, "/active", activeRequest{ProjectID: b, Source: "draft B"}); w.Code != http.StatusOK {
		t.Fatalf("draft B: %d", w.Code)
	}
	switchTo(a)
	w = serve(http.MethodGet, "/active", nil)
	if err := json.Unmarshal(w.Body.Bytes(), &active); err != nil {
		t.Fatal(err)
	}
	if active.ProjectID != a || active.Source != "draft A" {
		t.Fatalf("A draft lost: %+v", active)
	}
	switchTo(b)
	w = serve(http.MethodGet, "/active", nil)
	if err := json.Unmarshal(w.Body.Bytes(), &active); err != nil {
		t.Fatal(err)
	}
	if active.ProjectID != b || active.Source != "draft B" {
		t.Fatalf("B draft lost: %+v", active)
	}
}
