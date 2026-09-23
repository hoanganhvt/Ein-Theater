package python

import (
	"os"
	"path/filepath"
	"web-app/utils/paths"
)

// FindGenCodePyPath locates the generator from supported application and test directories.
func FindGenCodePyPath() string {
	candidates := []string{
		paths.Source("Canvas", "utils", "generate code", "gen_code.py"),
		filepath.Join("Canvas", "utils", "generate code", "gen_code.py"),
		filepath.Join("src", "Canvas", "utils", "generate code", "gen_code.py"),
		filepath.Join("utils", "generate code", "gen_code.py"),
		filepath.Join("src", "utils", "generate code", "gen_code.py"),
		filepath.Join("..", "Canvas", "utils", "generate code", "gen_code.py"),
		filepath.Join("..", "src", "Canvas", "utils", "generate code", "gen_code.py"),
		filepath.Join("..", "src", "utils", "generate code", "gen_code.py"),
		filepath.Join("..", "utils", "generate code", "gen_code.py"),
		filepath.Join("..", "idea", "test.py"),
		filepath.Join("idea", "test.py"),
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
	// Utility package tests run deeper in the tree than the application entry points.
	// Walk ancestors so moving the bridge does not change subprocess discovery.
	if dir, err := os.Getwd(); err == nil {
		for {
			for _, rel := range []string{
				filepath.Join("Canvas", "utils", "generate code", "gen_code.py"),
				filepath.Join("src", "Canvas", "utils", "generate code", "gen_code.py"),
			} {
				candidate := filepath.Join(dir, rel)
				if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
					return candidate
				}
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return filepath.Join("Canvas", "utils", "generate code", "gen_code.py")
}
