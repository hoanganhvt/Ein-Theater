package modelio

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"web-app/Canvas/utils/fault"
)

func TestSavedModelFormatsAndFailures(t *testing.T) {
	for _, wrapped := range []bool{false, true} {
		name := "legacy"
		if wrapped {
			name = "wrapped"
		}
		t.Run(name, func(t *testing.T) {
			folder := filepath.Join(t.TempDir(), "123 model")
			if err := os.Mkdir(folder, 0700); err != nil {
				t.Fatal(err)
			}
			payload := `{"nodes":[{"id":"input","layerType":"Input","params":{"shape":[2,4]}}],"edges":[]}`
			if wrapped {
				payload = `{"canvas":` + payload + `}`
			}
			// Sanitized companion filenames must still load from the original folder.
			jsonPath := filepath.Join(folder, "model_123_model.json")
			pyPath := filepath.Join(folder, "model_123_model.py")
			if err := os.WriteFile(jsonPath, []byte(payload), 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(pyPath, []byte("# fixture"), 0600); err != nil {
				t.Fatal(err)
			}
			graph, err := Load(folder)
			if err != nil || graph.Name != "model_123_model" || len(graph.Nodes) != 1 {
				t.Fatalf("load: %+v, %v", graph, err)
			}
			result, err := Inspect(folder)
			if err != nil || result["isModel"] != true || result["hasInputs"] != true {
				t.Fatalf("inspect: %+v, %v", result, err)
			}
			if err := os.WriteFile(jsonPath, []byte("{"), 0600); err != nil {
				t.Fatal(err)
			}
			_, err = Load(folder)
			var failure *fault.Error
			if !errors.As(err, &failure) || !failure.InvalidInput {
				t.Fatalf("malformed JSON: %v", err)
			}
			if err := os.Remove(pyPath); err != nil {
				t.Fatal(err)
			}
			result, err = Inspect(folder)
			if err != nil || result["isModel"] != false {
				t.Fatalf("missing companion: %+v, %v", result, err)
			}
		})
	}
}

func TestReadModelCanvasAfterSave(t *testing.T) {
	folder := filepath.Join(t.TempDir(), "saved")
	if err := os.Mkdir(folder, 0700); err != nil {
		t.Fatal(err)
	}
	for _, payload := range []string{`{"name":"saved","nodes":[],"edges":[]}`, `{"canvas":{"name":"saved","nodes":[],"edges":[]}}`} {
		if err := os.WriteFile(filepath.Join(folder, "saved.json"), []byte(payload), 0600); err != nil {
			t.Fatal(err)
		}
		got, err := ReadModelCanvas(folder)
		if err != nil || got.Name != "saved" {
			t.Fatalf("read: %+v, %v", got, err)
		}
	}
}
