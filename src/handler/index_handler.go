package handler

import (
	"net/http"
	"path/filepath"
)

// IndexHandler serves the main application HTML template.
func IndexHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, filepath.Join("templates", "index.html"))
}
