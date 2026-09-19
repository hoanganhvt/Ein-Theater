package studio

import (
	"html/template"
	"net/http"
	"web-app/utils/paths"
)

// ShellPage provides honest, navigable pages for modes awaiting their editor.
func ShellPage(id, name string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !AllowPageMethod(w, r) {
			return
		}
		page, err := template.ParseFiles(paths.Source("templates", "mode-shell.html"))
		if err != nil {
			http.Error(w, "mode template unavailable", 500)
			return
		}
		NoCache(w)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if r.Method == http.MethodHead {
			return
		}
		_ = page.Execute(w, struct{ ID, Name string }{id, name})
	}
}
