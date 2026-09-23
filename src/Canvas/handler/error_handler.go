package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"web-app/Canvas/utils/fault"
)

// writeError maps task failures to the existing HTTP status contract.
func writeError(w http.ResponseWriter, err error) {
	if strings.Contains(err.Error(), "python_unavailable") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]string{"code": "python_unavailable", "error": err.Error()})
		return
	}
	status := http.StatusInternalServerError
	var failure *fault.Error
	if errors.As(err, &failure) && failure.InvalidInput {
		status = http.StatusBadRequest
	}
	http.Error(w, err.Error(), status)
}
