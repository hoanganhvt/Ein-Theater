package handler

import (
	"net/http"

	"web-app/Canvas/utils/session"
)

var sessionManager *session.Manager

// ConfigurePersistence restores the most recent editor session and enables autosave.
func ConfigurePersistence(dataDir string) error {
	if dataDir == "" {
		return nil
	}
	sessionManager = session.New(dataDir, store)
	return sessionManager.Load()
}

// FlushPersistence writes pending state synchronously during application shutdown.
func FlushPersistence() error {
	if sessionManager == nil {
		return nil
	}
	return sessionManager.Flush()
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (w *statusRecorder) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

// PersistenceMiddleware schedules a snapshot after successful state-changing requests.
func PersistenceMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		if sessionManager != nil && r.Method != http.MethodGet && r.Method != http.MethodHead && recorder.status < 400 {
			sessionManager.Schedule()
		}
	})
}
