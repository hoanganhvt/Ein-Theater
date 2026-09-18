// Package templates discovers and composes trusted static HTML fragments.
// See document.md for component inputs, outputs, and test instructions.
package templates

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
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

// Includes are trusted, static HTML fragments, resolved relative to their owner.
// Compose before writing a response so missing fragments cannot send partial pages.
var templateInclude = regexp.MustCompile(`<!-- include: ([a-zA-Z0-9_./-]+) -->`)

// ComposeTemplate expands trusted include markers, rejecting cycles and nonlocal paths.
// Pass a fresh recursion-stack map and discard returned bytes when err is non-nil.
func ComposeTemplate(path string, active map[string]bool) ([]byte, error) {
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
		fragment, err := ComposeTemplate(filepath.Join(filepath.Dir(path), filepath.FromSlash(rel)), active)
		if err != nil {
			includeErr = err
			return ""
		}
		return string(fragment)
	})
	return []byte(result), includeErr
}

// ExtractSidebarFromHTML composes a template and returns its complete sidebar div.
func ExtractSidebarFromHTML(path string) (string, error) {
	data, err := ComposeTemplate(path, make(map[string]bool))
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
