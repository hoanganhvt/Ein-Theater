package handler

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Includes are trusted, static HTML fragments, resolved relative to their owner.
// Compose before writing a response so missing fragments cannot send partial pages.
var templateInclude = regexp.MustCompile(`<!-- include: ([a-zA-Z0-9_./-]+) -->`)

func composeTemplate(path string, active map[string]bool) ([]byte, error) {
	path = filepath.Clean(path)
	if active[path] {
		return nil, fmt.Errorf("circular template include: %s", path)
	}
	active[path] = true
	defer delete(active, path)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var includeErr error
	result := templateInclude.ReplaceAllStringFunc(string(data), func(marker string) string {
		if includeErr != nil {
			return ""
		}
		rel := templateInclude.FindStringSubmatch(marker)[1]
		if !filepath.IsLocal(rel) || strings.Contains(rel, "..") {
			includeErr = fmt.Errorf("invalid template include: %s", rel)
			return ""
		}
		fragment, err := composeTemplate(filepath.Join(filepath.Dir(path), filepath.FromSlash(rel)), active)
		if err != nil {
			includeErr = err
			return ""
		}
		return string(fragment)
	})
	return []byte(result), includeErr
}

func serveTemplate(w http.ResponseWriter, r *http.Request, path string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	data, err := composeTemplate(path, make(map[string]bool))
	if err != nil {
		http.Error(w, "Unable to load page template", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if r.Method != http.MethodHead {
		_, _ = w.Write(data)
	}
}
