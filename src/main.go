package main

import (
	"fmt"
	"mime"
	"net/http"
	"os"

	"web-app/handler"
)

func main() {
	fmt.Println("letsssssssssssss gooooooooooo!!!!")
	_ = mime.AddExtensionType(".js", "application/javascript; charset=utf-8")

	// Static web assets (served with no-cache headers to ensure browser always executes fresh JS)
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/static/", http.StripPrefix("/static/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fs.ServeHTTP(w, r)
	})))

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
	http.HandleFunc("/api/workspace/create-folder", handler.CreateFolderHandler)
	http.HandleFunc("/api/workspace/save-model", handler.SaveModelHandler)
	http.HandleFunc("/api/saveModel", handler.SaveModelHandler)
	http.HandleFunc("/api/workspace/load-model", handler.LoadModelHandler)
	http.HandleFunc("/api/loadModel", handler.LoadModelHandler)

	// Node / edge operations (all apply to the active project)
	http.HandleFunc("/api/rename", handler.RenameModelHandler)
	http.HandleFunc("/api/addNode", handler.AddNodeHandler)
	http.HandleFunc("/api/updateNode", handler.UpdateNodeHandler)
	http.HandleFunc("/api/deleteNode", handler.DeleteNodeHandler)
	http.HandleFunc("/api/deleteNodes", handler.DeleteNodesHandler)
	http.HandleFunc("/api/moveNode", handler.MoveNodeHandler)
	http.HandleFunc("/api/addEdge", handler.AddEdgeHandler)
	http.HandleFunc("/api/updateEdge", handler.UpdateEdgeHandler)
	http.HandleFunc("/api/deleteEdge", handler.DeleteEdgeHandler)
	http.HandleFunc("/api/clear", handler.ClearGraphHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	fmt.Printf("Server is running at http://localhost:%s\n", port)
	fmt.Println("Open your browser to interact with the graph!")
	fmt.Println("Press Ctrl+C to stop.")

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		fmt.Println("Error starting server:", err)
	}
}
