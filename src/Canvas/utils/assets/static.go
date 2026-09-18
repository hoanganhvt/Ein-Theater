// Package assets resolves global and Canvas static asset filesystems.
// See document.md for component inputs, outputs, and test instructions.
package assets

import (
	"net/http"
	"os"
	"path/filepath"
)

type multiDirFS []http.Dir

func (m multiDirFS) Open(name string) (http.File, error) {
	cleanName := filepath.FromSlash(name)
	for _, dir := range m {
		fullPath := filepath.Join(string(dir), cleanName)
		if _, err := os.Stat(fullPath); err == nil {
			f, err := dir.Open(name)
			if err == nil {
				return f, nil
			}
		}
	}
	return nil, os.ErrNotExist
}

// ResolveStaticFS locates both the global static directory and mode-specific static directory.
func ResolveStaticFS() http.FileSystem {
	var dirs []http.Dir

	// 1. Global static folder candidates (identified by global style.css)
	globalCandidates := []string{
		filepath.Join("..", "static"),
		filepath.Join("static"),
		filepath.Join("src", "static"),
	}
	for _, c := range globalCandidates {
		if _, err := os.Stat(filepath.Join(c, "style.css")); err == nil {
			dirs = append(dirs, http.Dir(c))
			break
		}
	}

	// 2. Mode-specific (Canvas) static folder candidates (identified by canvas.css)
	canvasCandidates := []string{
		filepath.Join("Canvas", "static"),
		filepath.Join("static"),
		filepath.Join("src", "Canvas", "static"),
		filepath.Join("..", "Canvas", "static"),
		filepath.Join("..", "src", "Canvas", "static"),
	}
	for _, c := range canvasCandidates {
		if _, err := os.Stat(filepath.Join(c, "canvas.css")); err == nil {
			dirs = append(dirs, http.Dir(c))
			break
		}
	}

	if len(dirs) == 0 {
		return http.Dir("static")
	}
	return multiDirFS(dirs)
}
