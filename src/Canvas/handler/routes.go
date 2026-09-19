// Package handler adapts Canvas HTTP requests to categorized task utilities.
package handler

import "net/http"

// RegisterAPI registers Canvas-only endpoints relative to the mounting API prefix.
func RegisterAPI(mux *http.ServeMux) { registerAPI(mux, "") }

func registerAPI(mux *http.ServeMux, prefix string) {
	// Graph data
	mux.HandleFunc(prefix+"/data", DataHandler)
	mux.HandleFunc(prefix+"/history", HistoryHandler)
	mux.HandleFunc(prefix+"/history/undo", HistoryHandler)
	mux.HandleFunc(prefix+"/history/redo", HistoryHandler)
	mux.HandleFunc(prefix+"/edit/drag", DragSelectionHandler)
	mux.HandleFunc(prefix+"/edit/delete", DeleteSelectionHandler)

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
	mux.HandleFunc(prefix+"/rename", recorded(RenameModelHandler))
	mux.HandleFunc(prefix+"/addNode", recorded(AddNodeHandler))
	mux.HandleFunc(prefix+"/updateNode", recorded(UpdateNodeHandler))
	mux.HandleFunc(prefix+"/deleteNode", recorded(DeleteNodeHandler))
	mux.HandleFunc(prefix+"/deleteNodes", recorded(DeleteNodesHandler))
	mux.HandleFunc(prefix+"/moveNode", recorded(MoveNodeHandler))
	mux.HandleFunc(prefix+"/moveNodes", recorded(MoveNodesHandler))
	mux.HandleFunc(prefix+"/addEdge", recorded(AddEdgeHandler))
	mux.HandleFunc(prefix+"/updateEdge", recorded(UpdateEdgeHandler))
	mux.HandleFunc(prefix+"/updateEdges", recorded(UpdateEdgesHandler))
	mux.HandleFunc(prefix+"/deleteEdge", recorded(DeleteEdgeHandler))
	mux.HandleFunc(prefix+"/paste", recorded(PasteGraphHandler))
	mux.HandleFunc(prefix+"/pasteGraph", recorded(PasteGraphHandler))
	mux.HandleFunc(prefix+"/clear", recorded(ClearGraphHandler))
}

// RegisterRoutes explicitly mounts legacy Canvas API paths, preventing namespace redirects.
func RegisterRoutes(mux *http.ServeMux) { registerAPI(mux, "/api") }
