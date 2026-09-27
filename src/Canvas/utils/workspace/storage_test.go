package workspace

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBrowseClassifiesModelDatasetAndLegacyFolders(t *testing.T) {
	root := t.TempDir()
	write := func(folder, file, value string) {
		path := filepath.Join(root, folder)
		_ = os.MkdirAll(path, 0700)
		if err := os.WriteFile(filepath.Join(path, file), []byte(value), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("Model_Cats", "Model_Cats.json", `{}`)
	write("Model_Cats", "Model_Cats.py", "# model")
	write("Data_Cats", "dataset.json", `{"schemaVersion":1,"id":"data-1","pipelines":[]}`)
	write("legacy", "legacy.json", `{}`)
	write("legacy", "legacy.py", "# model")
	if err := os.Mkdir(filepath.Join(root, "Data_Broken"), 0700); err != nil {
		t.Fatal(err)
	}

	result, err := Browse(root)
	if err != nil {
		t.Fatal(err)
	}
	items := map[string]DirectoryItem{}
	for _, item := range result.Folders {
		items[item.Name] = item
	}
	if !items["Model_Cats"].IsModel || items["Model_Cats"].IsDataset {
		t.Fatalf("model: %+v", items["Model_Cats"])
	}
	if !items["Data_Cats"].IsDataset || items["Data_Cats"].IsModel {
		t.Fatalf("dataset: %+v", items["Data_Cats"])
	}
	if !items["legacy"].IsModel {
		t.Fatalf("legacy: %+v", items["legacy"])
	}
	if items["Data_Broken"].Error == "" {
		t.Fatalf("broken dataset was not reported: %+v", items["Data_Broken"])
	}
}
