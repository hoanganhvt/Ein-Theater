// Package mode adapts Canvas to the studio's mode registration contract.
package mode

import (
	"net/http"
	"web-app/Canvas/handler"
	"web-app/studio"
	"web-app/utils/paths"
)

// Definition returns Canvas pages, relative API routes, and its owned static files.
func Definition() studio.Mode {
	return studio.Mode{
		ID: "canvas", Name: "Canvas",
		Page: handler.CanvasHandler, Home: handler.HomeHandler, Sidebar: handler.SidebarHandler,
		API: handler.RegisterAPI, Static: http.Dir(paths.Source("Canvas", "static")),
		LegacyAPI: handler.RegisterRoutes, LegacyStatic: true,
	}
}
