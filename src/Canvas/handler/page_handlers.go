package handler

import (
	"net/http"
	"os"
	"web-app/studio"
	"web-app/utils/paths"
	"web-app/utils/templates"
)

// HomeHandler serves the Canvas editor variant used as the studio's initial mode.
func HomeHandler(w http.ResponseWriter, r *http.Request) {
	studio.ServeTemplate(w, r, paths.Source("Canvas", "templates", "studio.html"))
}

// CanvasHandler serves the standalone Canvas editor document.
func CanvasHandler(w http.ResponseWriter, r *http.Request) {
	studio.ServeTemplate(w, r, paths.Source("Canvas", "templates", "canvas.html"))
}

// SidebarHandler serves only Canvas sidebar content; studio selects the mode.
func SidebarHandler(w http.ResponseWriter, r *http.Request) {
	if !studio.AllowPageMethod(w, r) {
		return
	}
	path := paths.Source("Canvas", "templates", "sidebar.html")
	if _, err := os.Stat(path); err != nil {
		content, err := templates.ExtractSidebarFromHTML(paths.Source("Canvas", "templates", "canvas.html"))
		if err != nil {
			http.Error(w, "Sidebar template not found", http.StatusNotFound)
			return
		}
		studio.NoCache(w)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if r.Method != http.MethodHead {
			_, _ = w.Write([]byte(content))
		}
		return
	}
	studio.ServeTemplate(w, r, path)
}
