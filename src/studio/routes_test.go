package studio

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestIndependentModesAndNamespaces(t *testing.T) {
	page := func(value string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(value)) }
	}
	makeMode := func(id string) Mode {
		return Mode{ID: id, Name: id, Page: page(id + " page"), Sidebar: page(id + " sidebar"),
			API:    func(mux *http.ServeMux) { mux.HandleFunc("/ping", page(id+" api")) },
			Static: http.FS(fstest.MapFS{"app.js": &fstest.MapFile{Data: []byte(id + " script")}}),
		}
	}
	a, b := makeMode("alpha"), makeMode("beta")
	a.Home = page("alpha home")
	a.LegacyAPI = func(mux *http.ServeMux) { mux.HandleFunc("/api/ping", page("alpha api")) }
	a.LegacyStatic = true
	app, err := NewHandler(Config{Modes: []Mode{a, b, {ID: "debug", Name: "Debug"}}, DefaultMode: "alpha"})
	if err != nil {
		t.Fatal(err)
	}
	for route, want := range map[string]string{
		"/": "alpha home", "/index": "alpha home", "/alpha": "alpha page", "/beta": "beta page",
		"/api/alpha/ping": "alpha api", "/api/beta/ping": "beta api", "/api/ping": "alpha api",
		"/api/sidebar?mode=beta": "beta sidebar", "/api/sidebar/alpha": "alpha sidebar",
		"/static/alpha/app.js": "alpha script", "/static/beta/app.js": "beta script", "/static/app.js": "alpha script",
	} {
		w := httptest.NewRecorder()
		app.ServeHTTP(w, httptest.NewRequest("GET", route, nil))
		if w.Code != 200 || w.Body.String() != want {
			t.Errorf("%s: %d %q, want %q", route, w.Code, w.Body.String(), want)
		}
	}
	for _, route := range []string{"/unknown", "/alpha/missing", "/debug", "/api/sidebar/debug", "/api/debug/ping"} {
		w := httptest.NewRecorder()
		app.ServeHTTP(w, httptest.NewRequest("GET", route, nil))
		if w.Code != 404 {
			t.Errorf("%s: %d", route, w.Code)
		}
	}
	w := httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("GET", "/api/modes", nil))
	var modes []struct {
		ID        string
		Available bool
		URL       string
	}
	if err := json.Unmarshal(w.Body.Bytes(), &modes); err != nil {
		t.Fatal(err)
	}
	if len(modes) != 3 || modes[2].Available || modes[2].URL != "" || modes[1].URL != "/beta" {
		t.Fatalf("registry: %+v", modes)
	}
	standalone, err := NewHandler(Config{Modes: []Mode{a}, DefaultMode: "alpha", Standalone: true})
	if err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	standalone.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Body.String() != "alpha page" {
		t.Fatal("standalone selected home variant")
	}
}

func TestRegistryValidation(t *testing.T) {
	page := func(http.ResponseWriter, *http.Request) {}
	for _, config := range []Config{
		{},
		{DefaultMode: "canvas", Modes: []Mode{{ID: "canvas"}}},
		{DefaultMode: "alpha", Modes: []Mode{{ID: "alpha", Page: page}, {ID: "alpha", Page: page}}},
		{DefaultMode: "sidebar", Modes: []Mode{{ID: "sidebar", Page: page}}},
		{DefaultMode: "../bad", Modes: []Mode{{ID: "../bad", Page: page}}},
		{DefaultMode: "alpha", Modes: []Mode{{ID: "alpha", Page: page}, {ID: "debug", Sidebar: page}}},
		{DefaultMode: "alpha", Modes: []Mode{{ID: "alpha", Page: page, LegacyAPI: func(*http.ServeMux) {}}}},
	} {
		if _, err := NewHandler(config); err == nil {
			t.Errorf("accepted invalid config: %+v", config)
		}
	}
}
