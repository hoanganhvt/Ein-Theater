package handler

import (
	"errors"
	"net/http"
	"web-app/Canvas/utils/fault"
)

// writeError maps task failures to the existing HTTP status contract.
func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	var failure *fault.Error
	if errors.As(err, &failure) && failure.InvalidInput {
		status = http.StatusBadRequest
	}
	http.Error(w, err.Error(), status)
}
