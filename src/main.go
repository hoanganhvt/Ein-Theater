package main

import (
	"fmt"
	"net/http"
	"os"

	canvas "web-app/Canvas/mode"
	"web-app/studio"
)

func main() {
	fmt.Println("Starting Ein Theater Studio...")

	mux, err := studio.NewHandler(studioConfig())
	if err != nil {
		panic(err)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Server is running at http://localhost:%s\n", port)
	fmt.Println("Default Mode: Canvas (http://localhost:" + port + ")")
	fmt.Println("Press Ctrl+C to stop.")

	if err := http.ListenAndServe(":"+port, mux); err != nil {
		fmt.Println("Error starting server:", err)
	}
}

func studioConfig() studio.Config {
	return studio.Config{
		DefaultMode: "canvas",
		Modes: []studio.Mode{
			canvas.Definition(),
			{ID: "data", Name: "Data", Page: studio.ShellPage("data", "Data")},
			{ID: "debug", Name: "Debug", Page: studio.ShellPage("debug", "Debug")},
			{ID: "code", Name: "Code", Page: studio.ShellPage("code", "Code")},
		},
	}
}
