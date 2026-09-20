package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"web-app/Canvas/utils/graph"
)

func TestWorkspaceModelRoundTrip(t *testing.T) {
	previous := store
	store = graph.NewStore()
	t.Cleanup(func() { store = previous })
	mux := http.NewServeMux()
	RegisterRoutes(mux)
	request := func(method, route, payload string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, route, strings.NewReader(payload))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	dir := t.TempDir()
	body, _ := json.Marshal(map[string]string{"dir": dir, "name": "demo"})
	if w := request("POST", "/api/workspace/create-folder", string(body)); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	folder := filepath.Join(dir, "demo")
	canvas := `{"canvas":{"name":"demo","nodes":[{"id":"input_0","layerType":"Input","params":{"shape":[1,3],"model_path":"child"}},{"id":"linear_0","layerType":"nn.Linear","x":100,"y":100}],"edges":[{"id":"e0","from":"input_0","to":"linear_0"}]}}`
	if err := os.WriteFile(filepath.Join(folder, "demo.json"), []byte(canvas), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "demo.py"), []byte("# fixture\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".hidden"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	w := request("GET", "/api/workspace/browse?dir="+url.QueryEscape(dir), "")
	var browse BrowseResponse
	if err := json.Unmarshal(w.Body.Bytes(), &browse); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || len(browse.Folders) != 1 || !browse.Folders[0].IsModel || len(browse.Files) != 0 {
		t.Fatalf("browse: %+v", browse)
	}
	w = request("GET", "/api/workspace/inspect-model?path="+url.QueryEscape(folder), "")
	var inspected map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &inspected); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || inspected["isModel"] != true || inspected["hasInputs"] != true {
		t.Fatalf("inspect: %+v", inspected)
	}
	for _, route := range []string{"/api/loadModel", "/api/workspace/load-model"} {
		body, _ = json.Marshal(map[string]string{"path": folder})
		w = request("POST", route, string(body))
		if w.Code != 200 {
			t.Fatalf("load: %s", w.Body.String())
		}
	}
	w = request("GET", "/api/data?analyze=false", "")
	var loaded GraphData
	if err := json.Unmarshal(w.Body.Bytes(), &loaded); err != nil {
		t.Fatal(err)
	}
	if loaded.Name != "demo" || len(loaded.Nodes) != 2 || len(loaded.Edges) != 1 || len(loaded.Edges[0].Lines) == 0 {
		t.Fatalf("loaded: %+v", loaded)
	}
	if loaded.Nodes[0].Params["model_path"] != filepath.Join(folder, "child") {
		t.Fatal("relative model path was not resolved")
	}
	if len(store.Projects) != 1 {
		t.Fatal("loading the same model created duplicate projects")
	}
	if w = request("POST", "/api/loadModel", `{"path":"`+strings.ReplaceAll(filepath.Join(dir, "missing"), `\`, `\\`)+`"}`); w.Code != 400 {
		t.Fatalf("missing model: %d", w.Code)
	}
	if w = request("GET", "/api/workspace/create-folder", ""); w.Code != 405 {
		t.Fatalf("method guard: %d", w.Code)
	}
}

func TestDeleteModelFolderOnlyWithinActiveWorkspace(t *testing.T) {
	previous := store
	store = graph.NewStore()
	t.Cleanup(func() { store = previous })
	root := t.TempDir()
	outside := t.TempDir()
	store.WorkingDir = root
	model := filepath.Join(root, "demo")
	otherModel := filepath.Join(outside, "other")
	plain := filepath.Join(root, "plain")
	for _, folder := range []string{model, otherModel, plain} {
		if err := os.Mkdir(folder, 0755); err != nil {
			t.Fatal(err)
		}
	}
	for _, folder := range []string{model, otherModel} {
		name := filepath.Base(folder)
		for _, ext := range []string{".json", ".py"} {
			if err := os.WriteFile(filepath.Join(folder, name+ext), []byte("fixture"), 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := os.Mkdir(filepath.Join(model, "nested"), 0755); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	RegisterRoutes(mux)
	request := func(method, path string) int {
		t.Helper()
		body, _ := json.Marshal(map[string]string{"path": path})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(method, "/api/workspace/delete-model-folder", strings.NewReader(string(body))))
		return w.Code
	}
	if got := request("GET", model); got != http.StatusMethodNotAllowed {
		t.Fatalf("GET: %d", got)
	}
	for _, path := range []string{root, plain, filepath.Join(model, "nested"), outside, otherModel, filepath.Join(root, "..", filepath.Base(otherModel))} {
		if got := request("POST", path); got != http.StatusBadRequest {
			t.Fatalf("delete %q: %d", path, got)
		}
	}
	if got := request("POST", model); got != http.StatusOK {
		t.Fatalf("model delete: %d", got)
	}
	if _, err := os.Stat(model); !os.IsNotExist(err) {
		t.Fatalf("model folder still exists: %v", err)
	}
	for _, path := range []string{plain, otherModel} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("protected folder %q: %v", path, err)
		}
	}
}
