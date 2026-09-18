package handler

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"web-app/Canvas/utils/templates"
)

// IndexHandler serves the global application HTML template (index.html), falling back to canvas.html.
func IndexHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	tpl := templates.FindTemplatePath("index.html")
	if _, err := os.Stat(tpl); err != nil {
		tpl = templates.FindTemplatePath("canvas.html")
	}
	serveTemplate(w, r, tpl)
}

// CanvasHandler serves the Canvas mode HTML template (canvas.html).
func CanvasHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	serveTemplate(w, r, templates.FindTemplatePath("canvas.html"))
}

// SidebarHandler serves mode-specific sidebar HTML fragments for the custom sidebar loader.
// Route: /api/sidebar?mode=canvas (or /api/sidebar/canvas)
func SidebarHandler(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("mode")
	if mode == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 {
			mode = parts[2]
		}
	}
	if mode == "" {
		mode = "canvas"
	}

	mode = strings.ToLower(mode)
	var tplPath string
	switch mode {
	case "canvas":
		tplPath = templates.FindTemplatePath("sidebar.html")
		if _, err := os.Stat(tplPath); err != nil {
			// Fallback: extract sidebar element from canvas.html
			tplPath = templates.FindTemplatePath("canvas.html")
			content, err := templates.ExtractSidebarFromHTML(tplPath)
			if err == nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
				w.Write([]byte(content))
				return
			}
		}
	default:
		modeSidebar := mode + "_sidebar.html"
		tplPath = templates.FindTemplatePath(modeSidebar)
		if _, err := os.Stat(tplPath); err != nil {
			http.Error(w, fmt.Sprintf("Sidebar for mode '%s' not implemented yet", mode), http.StatusNotFound)
			return
		}
	}

	if _, err := os.Stat(tplPath); err != nil {
		http.Error(w, "Sidebar template not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	serveTemplate(w, r, tplPath)
}
