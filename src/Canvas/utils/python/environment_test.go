package python

import (
	"strings"
	"testing"
)

func TestJSONPipeEncodingOverridesInheritedLocale(t *testing.T) {
	t.Setenv("PYTHONIOENCODING", "cp1252")
	t.Setenv("PYTHONUTF8", "0")
	// os/exec uses the last occurrence of a duplicate environment key.
	values := map[string]string{}
	for _, entry := range processEnvironment() {
		key, value, ok := strings.Cut(entry, "=")
		if ok {
			values[key] = value
		}
	}
	if values["PYTHONIOENCODING"] != "utf-8" || values["PYTHONUTF8"] != "1" {
		t.Fatalf("locale overrides not applied: %+v", map[string]string{"encoding": values["PYTHONIOENCODING"], "utf8": values["PYTHONUTF8"]})
	}
}
