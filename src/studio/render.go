package studio

import (
	"net/http"
	"web-app/utils/templates"
)

// AllowPageMethod accepts GET/HEAD or writes a 405 response with its Allow header.
func AllowPageMethod(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		return true
	}
	w.Header().Set("Allow", "GET, HEAD")
	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	return false
}

// NoCache applies the common development-time page and asset cache policy.
func NoCache(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
}

// ServeTemplate composes trusted fragments before sending a GET/HEAD HTML response.
func ServeTemplate(w http.ResponseWriter, r *http.Request, path string) {
	if !AllowPageMethod(w, r) {
		return
	}
	data, err := templates.ComposeTemplate(path, make(map[string]bool))
	if err != nil {
		http.Error(w, "Unable to load page template", http.StatusInternalServerError)
		return
	}
	NoCache(w)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if r.Method != http.MethodHead {
		_, _ = w.Write(data)
	}
}
