package handler

import "testing"

func TestFixModelName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"my model", "my_model"},
		{"123 cnn", "model_123_cnn"},
		{"123model", "model_123model"},
		{"42", "model_42"},
		{"0_resnet", "model_0_resnet"},
		{"resnet50", "resnet50"},
		{"model 1", "model_1"},
		{"", "model"},
		{"   ", "model"},
		{"Untitled Model", "Untitled_Model"},
	}

	for _, tt := range tests {
		got := FixModelName(tt.input)
		if got != tt.expected {
			t.Errorf("FixModelName(%q) = %q; expected %q", tt.input, got, tt.expected)
		}
		if !IsValidModelFolderName(got) {
			t.Errorf("FixModelName(%q) = %q, which is not a valid model folder name", tt.input, got)
		}
	}
}
