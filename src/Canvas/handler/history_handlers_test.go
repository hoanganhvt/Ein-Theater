package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"web-app/Canvas/utils/graph"
)

func TestHistoryHTTPAtomicEdits(t *testing.T) {
	previous := store
	store = graph.NewStore()
	t.Cleanup(func() { store = previous })
	mux := http.NewServeMux()
	RegisterRoutes(mux)
	call := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	for _, id := range []string{"A", "B"} {
		if w := call("POST", "/api/addNode?label="+id+"&layerType=Input", ""); w.Code != 200 {
			t.Fatal(w.Body.String())
		}
	}
	id := store.CurrentProjectID
	if w := call("POST", "/api/edit/drag", `{"projectId":"`+id+`","nodes":[{"id":"input_0","x":50,"y":50},{"id":"input_1","x":100,"y":100}]}`); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if len(store.Current().UndoStack) != 3 {
		t.Fatal("drag should be one history entry")
	}
	w := call("POST", "/api/history/undo?projectId="+id, "")
	var result struct {
		Graph   graph.GraphData `json:"graph"`
		CanRedo bool            `json:"canRedo"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if !result.CanRedo || result.Graph.Nodes[0].X != 0 {
		t.Fatal("undo failed", w.Body.String())
	}
	w = call("POST", "/api/edit/delete", `{"projectId":"`+id+`","nodes":["input_0","missing"]}`)
	if w.Code != 404 || len(store.Current().Nodes) != 2 {
		t.Fatal("invalid batch partially deleted")
	}
	w = call("POST", "/api/history/redo?projectId="+id, "")
	if w.Code != 200 {
		t.Fatal("failed request cleared redo")
	}
}
