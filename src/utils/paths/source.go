// Package paths locates application resources independently of any mode.
package paths

import (
	"os"
	"path/filepath"
)

// SourceRoot finds src from the repository, source, standalone-mode, or test directory.
// When discovery fails it returns the current directory; normal file errors remain visible.
func SourceRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	for current := dir; ; current = filepath.Dir(current) {
		for _, candidate := range []string{current, filepath.Join(current, "src")} {
			if _, err := os.Stat(filepath.Join(candidate, "go.mod")); err == nil {
				if info, err := os.Stat(filepath.Join(candidate, "templates")); err == nil && info.IsDir() {
					return candidate
				}
			}
		}
		if filepath.Dir(current) == current {
			break
		}
	}
	return dir
}

// Source joins trusted application resource components below the source root.
func Source(parts ...string) string {
	return filepath.Join(append([]string{SourceRoot()}, parts...)...)
}
