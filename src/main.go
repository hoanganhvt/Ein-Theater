package main

import (
	"fmt"
	"net/http"
	"os"

	"web-app/Canvas/handler"
)

func main() {
	fmt.Println("Starting Ein Theater Studio...")

	mux := http.DefaultServeMux

	// Register Canvas Mode routes & static assets
	handler.RegisterRoutes(mux)

	// Future mode registrations:
	// data.RegisterRoutes(mux)
	// train.RegisterRoutes(mux)
	// code.RegisterRoutes(mux)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Server is running at http://localhost:%s\n", port)
	fmt.Println("Default Mode: Canvas (http://localhost:" + port + ")")
	fmt.Println("Press Ctrl+C to stop.")

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		fmt.Println("Error starting server:", err)
	}
}
