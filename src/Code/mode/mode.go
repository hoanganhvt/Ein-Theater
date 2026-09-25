package mode

import (
	"net/http"
	"web-app/Code/server"
	"web-app/studio"
	"web-app/utils/paths"
)

func Definition() studio.Mode {
	return studio.Mode{ID: "code", Name: "Code", Page: server.Page,
		API: server.RegisterAPI, Static: http.Dir(paths.Source("Code", "static"))}
}
