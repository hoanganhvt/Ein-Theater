// Package handler adapts Canvas HTTP requests to categorized task utilities.
// See document.md for endpoint inputs, outputs, and test instructions.
package handler

import (
	"mime"
	"net/http"
	"web-app/Canvas/utils/assets"
	"web-app/Canvas/utils/templates"
)

// RegisterRoutes registers all Canvas API handlers, static file serving, and the default IndexHandler on root.
func RegisterRoutes(mux *http.ServeMux) {
	RegisterRoutesWithRoot(mux, IndexHandler)
}

// RegisterRoutesWithRoot registers all Canvas handlers with a custom root handler (e.g. CanvasHandler for standalone mode).
func RegisterRoutesWithRoot(mux *http.ServeMux, rootHandler http.HandlerFunc) {
	_ = mime.AddExtensionType(".js", "application/javascript; charset=utf-8")

	// Static web assets (served with no-cache headers to ensure browser always executes fresh JS)
	staticFS := assets.ResolveStaticFS()
	fs := http.FileServer(staticFS)
	mux.Handle("/static/", http.StripPrefix("/static/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fs.ServeHTTP(w, r)
	})))

	// App root
	if rootHandler != nil {
		mux.HandleFunc("/", rootHandler)
	}
	mux.HandleFunc("/canvas", CanvasHandler)
	mux.HandleFunc("/index", func(w http.ResponseWriter, r *http.Request) {
		serveTemplate(w, r, templates.FindTemplatePath("index.html"))
	})

	// Mode Sidebar Loader endpoint
	mux.HandleFunc("/api/sidebar", SidebarHandler)
	mux.HandleFunc("/api/sidebar/", SidebarHandler)

	// Graph data
	mux.HandleFunc("/api/data", DataHandler)

	// Project management
	mux.HandleFunc("/api/projects", ListProjectsHandler)
	mux.HandleFunc("/api/projects/create", CreateProjectHandler)
	mux.HandleFunc("/api/projects/switch", SwitchProjectHandler)
	mux.HandleFunc("/api/projects/delete", DeleteProjectHandler)

	// Workspace / Working Directory management
	mux.HandleFunc("/api/workspace", WorkspaceHandler)
	mux.HandleFunc("/api/workspace/set", SetWorkspaceHandler)
	mux.HandleFunc("/api/workspace/browse", BrowseWorkspaceHandler)
	mux.HandleFunc("/api/workspace/select-native", SelectNativeFolderHandler)
	mux.HandleFunc("/api/workspace/create-folder", CreateFolderHandler)
	mux.HandleFunc("/api/workspace/inspect-model", InspectModelHandler)
	mux.HandleFunc("/api/workspace/save-model", SaveModelHandler)
	mux.HandleFunc("/api/saveModel", SaveModelHandler)
	mux.HandleFunc("/api/workspace/load-model", LoadModelHandler)
	mux.HandleFunc("/api/loadModel", LoadModelHandler)

	// Node / edge operations (all apply to the active project)
	mux.HandleFunc("/api/rename", RenameModelHandler)
	mux.HandleFunc("/api/addNode", AddNodeHandler)
	mux.HandleFunc("/api/updateNode", UpdateNodeHandler)
	mux.HandleFunc("/api/deleteNode", DeleteNodeHandler)
	mux.HandleFunc("/api/deleteNodes", DeleteNodesHandler)
	mux.HandleFunc("/api/moveNode", MoveNodeHandler)
	mux.HandleFunc("/api/moveNodes", MoveNodesHandler)
	mux.HandleFunc("/api/addEdge", AddEdgeHandler)
	mux.HandleFunc("/api/updateEdge", UpdateEdgeHandler)
	mux.HandleFunc("/api/updateEdges", UpdateEdgesHandler)
	mux.HandleFunc("/api/deleteEdge", DeleteEdgeHandler)
	mux.HandleFunc("/api/paste", PasteGraphHandler)
	mux.HandleFunc("/api/pasteGraph", PasteGraphHandler)
	mux.HandleFunc("/api/clear", ClearGraphHandler)
}
