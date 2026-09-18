package handler

import (
	"net/http"
	"web-app/Canvas/utils/templates"
)

func serveTemplate(w http.ResponseWriter, r *http.Request, path string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	data, err := templates.ComposeTemplate(path, make(map[string]bool))
	if err != nil {
		http.Error(w, "Unable to load page template", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if r.Method != http.MethodHead {
		_, _ = w.Write(data)
	}
}
