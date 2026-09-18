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

	mux, err := studio.NewHandler(studio.Config{
		DefaultMode: "canvas",
		Modes: []studio.Mode{
			canvas.Definition(),
			{ID: "data", Name: "Data"},
			{ID: "code", Name: "Code"},
			{ID: "train", Name: "Train"},
			{ID: "debug", Name: "Debug"},
		},
	})
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
