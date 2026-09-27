package naming

import "testing"

func TestStorageNamesPreserveDisplayName(t *testing.T) {
	for _, tc := range []struct{ input, folder string }{
		{"Cats", "Model_Cats"},
		{"Mèo Việt", "Model_Mèo Việt"},
		{"Model_Ready", "Model_Model_Ready"},
	} {
		got, err := ModelFolderName(tc.input)
		if err != nil || got != tc.folder {
			t.Fatalf("ModelFolderName(%q) = %q, %v", tc.input, got, err)
		}
	}
	for _, invalid := range []string{"", "../escape", "bad/name", "CON", "trailing."} {
		if _, err := ValidateDisplayName(invalid); err == nil {
			t.Fatalf("accepted invalid name %q", invalid)
		}
	}
}
