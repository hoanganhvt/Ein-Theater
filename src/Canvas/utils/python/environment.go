package python

import "os"

// processEnvironment makes piped JSON explicitly UTF-8 on Windows as well as Unix.
// Locale-dependent decoding can corrupt and expand Unicode captions on each round trip.
func processEnvironment() []string {
	return append(os.Environ(), "PYTHONDONTWRITEBYTECODE=1", "PYTHONUTF8=1", "PYTHONIOENCODING=utf-8")
}
