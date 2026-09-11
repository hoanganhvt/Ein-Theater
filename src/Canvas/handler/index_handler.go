package handler

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// FindTemplatePath dynamically locates an HTML template file across candidate paths.
func FindTemplatePath(rel string) string {
	candidates := []string{
		filepath.Join("templates", rel),
		filepath.Join("src", "templates", rel),
		filepath.Join("..", "templates", rel),
		filepath.Join("Canvas", "templates", rel),
		filepath.Join("src", "Canvas", "templates", rel),
		filepath.Join("..", "Canvas", "templates", rel),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			abs, err := filepath.Abs(c)
			if err == nil {
				return abs
			}
			return c
		}
	}
	return filepath.Join("Canvas", "templates", rel)
}

// IndexHandler serves the global application HTML template (index.html), falling back to canvas.html.
func IndexHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	tpl := FindTemplatePath("index.html")
	if _, err := os.Stat(tpl); err != nil {
		tpl = FindTemplatePath("canvas.html")
	}
	http.ServeFile(w, r, tpl)
}

// CanvasHandler serves the Canvas mode HTML template (canvas.html).
func CanvasHandler(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, FindTemplatePath("canvas.html"))
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
		tplPath = FindTemplatePath("sidebar.html")
		if _, err := os.Stat(tplPath); err != nil {
			// Fallback: extract sidebar element from canvas.html
			tplPath = FindTemplatePath("canvas.html")
			content, err := extractSidebarFromHTML(tplPath)
			if err == nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
				w.Write([]byte(content))
				return
			}
		}
	default:
		modeSidebar := mode + "_sidebar.html"
		tplPath = FindTemplatePath(modeSidebar)
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
	http.ServeFile(w, r, tplPath)
}

func extractSidebarFromHTML(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	content := string(data)
	startIdx := strings.Index(content, "<div class=\"sidebar\"")
	if startIdx == -1 {
		startIdx = strings.Index(content, "<div class=\"sidebar ")
	}
	if startIdx == -1 {
		return "", fmt.Errorf("sidebar element not found in %s", path)
	}

	depth := 0
	endIdx := -1
	for i := startIdx; i < len(content); {
		if strings.HasPrefix(content[i:], "<div") {
			depth++
			i += 4
		} else if strings.HasPrefix(content[i:], "</div>") {
			depth--
			if depth == 0 {
				endIdx = i + 6
				break
			}
			i += 6
		} else {
			i++
		}
	}
	if endIdx == -1 {
		return "", fmt.Errorf("closing div for sidebar not found in %s", path)
	}
	return content[startIdx:endIdx], nil
}
