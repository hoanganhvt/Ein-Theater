package main

import (
	"fmt"
	"mime"
	"net/http"

	"web-app/handler"
)

func main() {
	fmt.Println("letsssssssssssss gooooooooooo!!!!")
	_ = mime.AddExtensionType(".js", "application/javascript; charset=utf-8")

	// Static web assets
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// App root
	http.HandleFunc("/", handler.IndexHandler)

	// Graph data
	http.HandleFunc("/api/data", handler.DataHandler)

	// Project management
	http.HandleFunc("/api/projects", handler.ListProjectsHandler)
	http.HandleFunc("/api/projects/create", handler.CreateProjectHandler)
	http.HandleFunc("/api/projects/switch", handler.SwitchProjectHandler)
	http.HandleFunc("/api/projects/delete", handler.DeleteProjectHandler)

	// Workspace / Working Directory management
	http.HandleFunc("/api/workspace", handler.WorkspaceHandler)
	http.HandleFunc("/api/workspace/set", handler.SetWorkspaceHandler)
	http.HandleFunc("/api/workspace/browse", handler.BrowseWorkspaceHandler)
	http.HandleFunc("/api/workspace/select-native", handler.SelectNativeFolderHandler)

	// Node / edge operations (all apply to the active project)
	http.HandleFunc("/api/rename", handler.RenameModelHandler)
	http.HandleFunc("/api/addNode", handler.AddNodeHandler)
	http.HandleFunc("/api/updateNode", handler.UpdateNodeHandler)
	http.HandleFunc("/api/deleteNode", handler.DeleteNodeHandler)
	http.HandleFunc("/api/deleteNodes", handler.DeleteNodesHandler)
	http.HandleFunc("/api/moveNode", handler.MoveNodeHandler)
	http.HandleFunc("/api/addEdge", handler.AddEdgeHandler)
	http.HandleFunc("/api/deleteEdge", handler.DeleteEdgeHandler)
	http.HandleFunc("/api/clear", handler.ClearGraphHandler)

	fmt.Println("Server is running at http://localhost:8080")
	fmt.Println("Open your browser to interact with the graph!")
	fmt.Println("Press Ctrl+C to stop.")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		fmt.Println("Error starting server:", err)
	}
}
