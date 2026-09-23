// Package studio owns mode-independent application routing and page responses.
package studio

import (
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"os"
	"regexp"
	"strings"
	"web-app/utils/assets"
	"web-app/utils/paths"
)

// Mode describes one registered feature. A nil Page declares a planned mode.
// API registers relative paths such as /data on a private mux, never global routes.
type Mode struct {
	ID           string
	Name         string
	Page         http.HandlerFunc
	Home         http.HandlerFunc
	Sidebar      http.HandlerFunc
	API          func(*http.ServeMux)
	Static       http.FileSystem
	LegacyAPI    func(*http.ServeMux)
	LegacyStatic bool
}

// Config selects the initial mode; Standalone uses its Page instead of optional Home.
type Config struct {
	Modes       []Mode
	DefaultMode string
	Standalone  bool
}

// NewHandler validates the registry and builds an independent application router.
func NewHandler(config Config) (http.Handler, error) {
	modes := make(map[string]Mode)
	legacyAPI, legacyStatic := false, false
	validID := regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
	for _, mode := range config.Modes {
		if !validID.MatchString(mode.ID) || mode.ID == "api" || mode.ID == "static" || mode.ID == "index" || mode.ID == "sidebar" || mode.ID == "modes" || mode.ID == "studio" {
			return nil, fmt.Errorf("invalid or reserved mode ID: %q", mode.ID)
		}
		if _, exists := modes[mode.ID]; exists {
			return nil, fmt.Errorf("duplicate mode: %s", mode.ID)
		}
		if mode.Page == nil && (mode.Home != nil || mode.Sidebar != nil || mode.API != nil || mode.Static != nil || mode.LegacyAPI != nil || mode.LegacyStatic) {
			return nil, fmt.Errorf("planned mode %s cannot register active resources", mode.ID)
		}
		if mode.LegacyAPI != nil && (legacyAPI || mode.API == nil) {
			return nil, fmt.Errorf("invalid legacy API owner: %s", mode.ID)
		}
		if mode.LegacyStatic && (legacyStatic || mode.Static == nil) {
			return nil, fmt.Errorf("invalid legacy static owner: %s", mode.ID)
		}
		legacyAPI = legacyAPI || mode.LegacyAPI != nil
		legacyStatic = legacyStatic || mode.LegacyStatic
		modes[mode.ID] = mode
	}
	initial, ok := modes[config.DefaultMode]
	if !ok || initial.Page == nil {
		return nil, fmt.Errorf("default mode must be available: %s", config.DefaultMode)
	}
	mux := http.NewServeMux()
	_ = mime.AddExtensionType(".js", "application/javascript; charset=utf-8")
	globalStatic := http.FileSystem(http.Dir(paths.Source("static")))
	if overlay := os.Getenv("EIN_THEATER_STATIC_OVERLAY_DIR"); overlay != "" {
		globalStatic = assets.Overlay(http.FileSystem(http.Dir(overlay)), globalStatic)
	}
	for _, mode := range config.Modes {
		if mode.Page == nil {
			continue
		}
		mux.HandleFunc("/"+mode.ID, exact("/"+mode.ID, mode.Page))
		if mode.API != nil {
			api := http.NewServeMux()
			mode.API(api)
			prefix := "/api/" + mode.ID
			mux.Handle(prefix+"/", http.StripPrefix(prefix, api))
			if mode.LegacyAPI != nil {
				mode.LegacyAPI(mux)
			}
		}
		if mode.Static != nil {
			prefix := "/static/" + mode.ID + "/"
			mux.Handle(prefix, http.StripPrefix(prefix, noCache(http.FileServer(mode.Static))))
			if mode.LegacyStatic {
				globalStatic = assets.Overlay(globalStatic, mode.Static)
			}
		}
	}
	mux.Handle("/static/", http.StripPrefix("/static/", noCache(http.FileServer(globalStatic))))
	index := IndexHandler(initial, config.Standalone)
	mux.HandleFunc("/", exact("/", index))
	mux.HandleFunc("/index", exact("/index", index))
	sidebar := SidebarHandler(modes, config.DefaultMode)
	mux.HandleFunc("/api/sidebar", sidebar)
	mux.HandleFunc("/api/sidebar/", sidebar)
	type descriptor struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		Available bool   `json:"available"`
		URL       string `json:"url,omitempty"`
	}
	items := make([]descriptor, 0, len(config.Modes))
	for _, mode := range config.Modes {
		item := descriptor{ID: mode.ID, Name: mode.Name, Available: mode.Page != nil}
		if item.Available {
			item.URL = "/" + mode.ID
		}
		items = append(items, item)
	}
	mux.HandleFunc("/api/modes", func(w http.ResponseWriter, r *http.Request) {
		if !AllowPageMethod(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if r.Method != http.MethodHead {
			_ = json.NewEncoder(w).Encode(items)
		}
	})
	return mux, nil
}

// IndexHandler dispatches the application entry to the configured default mode.
func IndexHandler(mode Mode, standalone bool) http.HandlerFunc {
	page := mode.Page
	if !standalone && mode.Home != nil {
		page = mode.Home
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if !AllowPageMethod(w, r) {
			return
		}
		NoCache(w)
		page(w, r)
	}
}

// SidebarHandler dispatches only to registered, available mode sidebars.
func SidebarHandler(modes map[string]Mode, defaultMode string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !AllowPageMethod(w, r) {
			return
		}
		id := r.URL.Query().Get("mode")
		if id == "" {
			id = strings.TrimPrefix(r.URL.Path, "/api/sidebar")
			id = strings.TrimPrefix(id, "/")
		}
		if id == "" {
			id = defaultMode
		}
		mode, ok := modes[strings.ToLower(id)]
		if !ok || mode.Page == nil || mode.Sidebar == nil {
			http.NotFound(w, r)
			return
		}
		NoCache(w)
		mode.Sidebar(w, r)
	}
}

func exact(path string, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != path {
			http.NotFound(w, r)
			return
		}
		handler(w, r)
	}
}

func noCache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { NoCache(w); next.ServeHTTP(w, r) })
}
