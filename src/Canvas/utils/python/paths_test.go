package python

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGeneratorDiscoveryFromLaunchAndPackageDirectories(t *testing.T) {
	want, err := filepath.Abs(filepath.Join("..", "generate code", "gen_code.py"))
	if err != nil {
		t.Fatal(err)
	}
	for _, dir := range []string{".", "../..", "../../.."} {
		t.Run(dir, func(t *testing.T) {
			t.Chdir(dir)
			got := FindGenCodePyPath()
			if got != want {
				t.Fatalf("generator = %q, want %q", got, want)
			}
			if _, err := os.Stat(filepath.Join(filepath.Dir(got), "..", "auto_shape_fitting", "shape_inference.py")); err != nil {
				t.Fatal(err)
			}
		})
	}
}
