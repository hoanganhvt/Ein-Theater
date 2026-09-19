package main

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"web-app/studio"
)

func TestStudioModes(t *testing.T) {
	app, err := studio.NewHandler(studioConfig())
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("GET", "/api/modes", nil))
	var modes []struct {
		ID        string
		Available bool
	}
	if err := json.Unmarshal(w.Body.Bytes(), &modes); err != nil {
		t.Fatal(err)
	}
	want := []string{"canvas", "data", "debug", "code"}
	if len(modes) != len(want) {
		t.Fatalf("modes: %+v", modes)
	}
	for i, mode := range modes {
		if mode.ID != want[i] || !mode.Available {
			t.Fatalf("modes: %+v", modes)
		}
		w = httptest.NewRecorder()
		app.ServeHTTP(w, httptest.NewRequest("GET", "/"+mode.ID, nil))
		if w.Code != 200 || !strings.Contains(w.Body.String(), "studioMenubar") {
			t.Fatalf("mode %s unavailable: %d", mode.ID, w.Code)
		}
	}
	for _, path := range []string{"/static/studio/menubar.js", "/static/studio/navigation.js", "/static/studio/shell.js", "/static/style.css"} {
		w = httptest.NewRecorder()
		app.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 || w.Body.Len() == 0 { t.Fatalf("asset %s unavailable: %d", path, w.Code) }
	}
}
