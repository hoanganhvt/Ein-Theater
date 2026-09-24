package paths

import (
	"path/filepath"
	"testing"
)

func TestConfiguredResourceRoot(t *testing.T) {
	root := t.TempDir()
	t.Setenv("EIN_THEATER_RESOURCE_DIR", root)
	if got := Source("Canvas", "data", "modules.json"); got != filepath.Join(root, "Canvas", "data", "modules.json") {
		t.Fatalf("Source() = %q", got)
	}
}
