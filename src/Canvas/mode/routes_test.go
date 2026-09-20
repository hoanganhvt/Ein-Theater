package mode

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"web-app/studio"
)

func chdirForTest(t *testing.T, dir string) {
	t.Helper()
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(previous); err != nil {
			t.Error(err)
		}
	})
}

func TestUIRoutesComposeFragments(t *testing.T) {
	// Test both supported launch directories, including the standalone Canvas app.
	for _, dir := range []string{"../..", ".."} {
		t.Run(dir, func(t *testing.T) {
			chdirForTest(t, dir)
			mux, err := studio.NewHandler(studio.Config{Modes: []studio.Mode{Definition()}, DefaultMode: "canvas"})
			if err != nil {
				t.Fatal(err)
			}
			for _, route := range []string{"/", "/index", "/canvas", "/api/sidebar?mode=canvas", "/api/sidebar/canvas"} {
				response := httptest.NewRecorder()
				mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, route, nil))
				body := response.Body.String()
				if response.Code != http.StatusOK || strings.Contains(body, "<!-- include:") {
					t.Fatalf("%s: status=%d, unresolved include=%v", route, response.Code, strings.Contains(body, "<!-- include:"))
				}
				id := `id="mynetwork"`
				if strings.HasPrefix(route, "/api/sidebar") {
					id = `id="paletteList"`
				}
				if !strings.Contains(body, id) {
					t.Errorf("%s: missing UI mount %s", route, id)
				}
			}
			for _, asset := range []string{"app.js", "canvas/app.js", "studio/navigation.js", "js/application/bootstrap.js", "js/circuit/geometry.js", "styles/base.css", "canvas-styles/interactions.css"} {
				response := httptest.NewRecorder()
				mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/static/"+asset, nil))
				if response.Code != http.StatusOK {
					t.Errorf("asset %s: status=%d", asset, response.Code)
				}
			}
			for _, route := range []string{"/api/data?analyze=false", "/api/canvas/data?analyze=false"} {
				response := httptest.NewRecorder()
				mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, route, nil))
				if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"projectId"`) {
					t.Errorf("API %s: %d %s", route, response.Code, response.Body.String())
				}
			}
			for _, route := range []string{"/", "/index", "/canvas", "/api/sidebar/canvas", "/api/modes"} {
				response := httptest.NewRecorder()
				mux.ServeHTTP(response, httptest.NewRequest(http.MethodHead, route, nil))
				if response.Code != http.StatusOK || response.Body.Len() != 0 {
					t.Errorf("HEAD %s: %d, body=%q", route, response.Code, response.Body.String())
				}
				response = httptest.NewRecorder()
				mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, route, nil))
				if response.Code != http.StatusMethodNotAllowed {
					t.Errorf("POST %s: %d", route, response.Code)
				}
			}
		})
	}
}

func TestTemplateIncludeFailuresAreAtomic(t *testing.T) {
	dir := t.TempDir()
	page := filepath.Join(dir, "page.html")
	for _, include := range []string{"missing.html", "page.html", "../outside.html"} {
		if err := os.WriteFile(page, []byte("<main><!-- include: "+include+" --></main>"), 0600); err != nil {
			t.Fatal(err)
		}
		response := httptest.NewRecorder()
		studio.ServeTemplate(response, httptest.NewRequest(http.MethodGet, "/", nil), page)
		if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), "<main>") {
			t.Errorf("include %s: partial or successful response", include)
		}
	}
}

func TestFutureDataModeDoesNotRedirectLegacyCanvasGraph(t *testing.T) {
	data := studio.Mode{ID: "data", Name: "Data",
		Page: func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("Data page")) },
		API: func(mux *http.ServeMux) {
			mux.HandleFunc("/datasets", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("datasets")) })
		},
	}
	app, err := studio.NewHandler(studio.Config{Modes: []studio.Mode{Definition(), data}, DefaultMode: "canvas"})
	if err != nil {
		t.Fatal(err)
	}
	for route, want := range map[string]string{
		"/api/data?analyze=false":        `"projectId"`,
		"/api/canvas/data?analyze=false": `"projectId"`,
		"/api/data/datasets":             "datasets",
	} {
		w := httptest.NewRecorder()
		app.ServeHTTP(w, httptest.NewRequest(http.MethodGet, route, nil))
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), want) {
			t.Errorf("%s: %d %s", route, w.Code, w.Body.String())
		}
	}
}
