package handler

import (
	"encoding/json"
	"net/http"
	"os"

	"web-app/Canvas/utils/python"
)

var applicationVersion = "dev"

func SetApplicationVersion(version string) { applicationVersion = version }

// RegisterRuntimeRoutes adds process-level health and Python configuration APIs.
func RegisterRuntimeRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		mode := "web"
		if os.Getenv("EIN_THEATER_DESKTOP") == "1" {
			mode = "desktop"
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok", "version": applicationVersion, "mode": mode})
	})
	mux.HandleFunc("/api/runtime/python", PythonRuntimeHandler)
}

func PythonRuntimeHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		_ = json.NewEncoder(w).Encode(python.Detect())
	case http.MethodPost:
		var request struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, `{"code":"invalid_request","error":"invalid request body"}`, http.StatusBadRequest)
			return
		}
		status, err := python.SetExecutable(request.Path)
		if err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"code": "python_unavailable", "error": err.Error(), "runtime": status})
			return
		}
		_ = json.NewEncoder(w).Encode(status)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
