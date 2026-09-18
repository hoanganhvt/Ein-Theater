package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUIRoutesComposeFragments(t *testing.T) {
	// Test both supported launch directories, including the standalone Canvas app.
	for _, dir := range []string{"../..", ".."} {
		t.Run(dir, func(t *testing.T) {
			t.Chdir(dir)
			mux := http.NewServeMux()
			RegisterRoutes(mux)
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
			for _, asset := range []string{"app.js", "js/application/bootstrap.js", "js/circuit/geometry.js", "styles/base.css", "canvas-styles/interactions.css"} {
				response := httptest.NewRecorder()
				mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/static/"+asset, nil))
				if response.Code != http.StatusOK {
					t.Errorf("asset %s: status=%d", asset, response.Code)
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
		serveTemplate(response, httptest.NewRequest(http.MethodGet, "/", nil), page)
		if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), "<main>") {
			t.Errorf("include %s: partial or successful response", include)
		}
	}
}
