// Package mode registers Data mode with Studio.
package mode

import (
	"net/http"
	"web-app/Data/server"
	"web-app/studio"
	"web-app/utils/paths"
)

func Definition() studio.Mode {
	return studio.Mode{ID: "data", Name: "Data", Page: server.Page,
		API: server.RegisterAPI, Static: http.Dir(paths.Source("Data", "static"))}
}
