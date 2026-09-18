// Package naming validates model names and normalizes layer ID prefixes.
// See document.md for component inputs, outputs, and test instructions.
package naming

import (
	"strings"
)

// IsValidModelFolderName checks whether a folder name satisfies:
// 1. Only normal Latin characters (a-z, A-Z) and numbers (0-9) (and optional underscore)
// 2. No white space
// 3. Character first, number later (first character must be a Latin letter a-z or A-Z)
func IsValidModelFolderName(name string) bool {
	if strings.Contains(name, " ") || name == "" {
		return false
	}
	first := name[0]
	if !((first >= 'a' && first <= 'z') || (first >= 'A' && first <= 'Z')) {
		return false
	}
	for i := 1; i < len(name); i++ {
		ch := name[i]
		if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_') {
			return false
		}
	}
	return true
}

// FixModelName sanitizes and fixes an invalid model name:
// - If the model name has space, replace space with _
// - If the model name has number before the text, add the word model_ infront of it
func FixModelName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "model"
	}

	// 1. If the model name has space, replace space with _
	if strings.Contains(name, " ") {
		name = strings.ReplaceAll(name, " ", "_")
	}

	// 2. If the model name has number before the text, add the word model_ infront of it
	hasNumBefore := false
	for i := 0; i < len(name); i++ {
		ch := name[i]
		if ch >= '0' && ch <= '9' {
			hasNumBefore = true
			break
		}
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') {
			break
		}
	}
	if hasNumBefore {
		name = "model_" + name
	}

	// Ensure all characters are valid Latin letters, digits, or underscore
	var sb strings.Builder
	for i := 0; i < len(name); i++ {
		ch := name[i]
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' {
			sb.WriteByte(ch)
		} else {
			sb.WriteByte('_')
		}
	}
	res := sb.String()

	// Ensure the first character is a letter
	if res == "" || !((res[0] >= 'a' && res[0] <= 'z') || (res[0] >= 'A' && res[0] <= 'Z')) {
		res = "model_" + strings.TrimLeft(res, "_")
		if res == "model_" {
			res = "model"
		}
	}
	return res
}

// LayerTypeToPrefix returns the normalized lowercase prefix for a layer type.
// e.g. "nn.Linear" -> "linear", "nn.Conv2d" -> "conv", "nn.ReLU" -> "relu".
func LayerTypeToPrefix(layerType string) string {
	clean := strings.TrimPrefix(layerType, "nn.")
	clean = strings.TrimPrefix(clean, "torch.")
	clean = strings.ToLower(clean)
	if clean == "conv2d" {
		clean = "conv"
	} else if clean == "batchnorm2d" {
		clean = "batchnorm"
	} else if clean == "maxpool2d" {
		clean = "maxpool"
	}
	var sb strings.Builder
	for _, ch := range clean {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') {
			sb.WriteRune(ch)
		}
	}
	res := sb.String()
	if res == "" {
		res = "block"
	}
	return res
}
