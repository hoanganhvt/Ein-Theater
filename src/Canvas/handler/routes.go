// Package handler adapts Canvas HTTP requests to categorized task utilities.
package handler

import "net/http"

// RegisterAPI registers Canvas-only endpoints relative to the mounting API prefix.
func RegisterAPI(mux *http.ServeMux) { registerAPI(mux, "") }

func registerAPI(mux *http.ServeMux, prefix string) {
	// Graph data
	mux.HandleFunc(prefix+"/data", DataHandler)

	// Project management
	mux.HandleFunc(prefix+"/projects", ListProjectsHandler)
	mux.HandleFunc(prefix+"/projects/create", CreateProjectHandler)
	mux.HandleFunc(prefix+"/projects/switch", SwitchProjectHandler)
	mux.HandleFunc(prefix+"/projects/delete", DeleteProjectHandler)

	// Workspace / Working Directory management
	mux.HandleFunc(prefix+"/workspace", WorkspaceHandler)
	mux.HandleFunc(prefix+"/workspace/set", SetWorkspaceHandler)
	mux.HandleFunc(prefix+"/workspace/browse", BrowseWorkspaceHandler)
	mux.HandleFunc(prefix+"/workspace/select-native", SelectNativeFolderHandler)
	mux.HandleFunc(prefix+"/workspace/create-folder", CreateFolderHandler)
	mux.HandleFunc(prefix+"/workspace/inspect-model", InspectModelHandler)
	mux.HandleFunc(prefix+"/workspace/save-model", SaveModelHandler)
	mux.HandleFunc(prefix+"/saveModel", SaveModelHandler)
	mux.HandleFunc(prefix+"/workspace/load-model", LoadModelHandler)
	mux.HandleFunc(prefix+"/loadModel", LoadModelHandler)

	// Node / edge operations (all apply to the active project)
	mux.HandleFunc(prefix+"/rename", RenameModelHandler)
	mux.HandleFunc(prefix+"/addNode", AddNodeHandler)
	mux.HandleFunc(prefix+"/updateNode", UpdateNodeHandler)
	mux.HandleFunc(prefix+"/deleteNode", DeleteNodeHandler)
	mux.HandleFunc(prefix+"/deleteNodes", DeleteNodesHandler)
	mux.HandleFunc(prefix+"/moveNode", MoveNodeHandler)
	mux.HandleFunc(prefix+"/moveNodes", MoveNodesHandler)
	mux.HandleFunc(prefix+"/addEdge", AddEdgeHandler)
	mux.HandleFunc(prefix+"/updateEdge", UpdateEdgeHandler)
	mux.HandleFunc(prefix+"/updateEdges", UpdateEdgesHandler)
	mux.HandleFunc(prefix+"/deleteEdge", DeleteEdgeHandler)
	mux.HandleFunc(prefix+"/paste", PasteGraphHandler)
	mux.HandleFunc(prefix+"/pasteGraph", PasteGraphHandler)
	mux.HandleFunc(prefix+"/clear", ClearGraphHandler)
}

// RegisterRoutes explicitly mounts legacy Canvas API paths, preventing namespace redirects.
func RegisterRoutes(mux *http.ServeMux) { registerAPI(mux, "/api") }
