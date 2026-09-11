package main

import (
	"fmt"
	"net/http"
	"os"

	"web-app/Canvas/handler"
)

func main() {
	fmt.Println("Starting Ein Theater [Canvas Mode]...")

	mux := http.NewServeMux()
	// Standalone Canvas mode: serves canvas.html at root
	handler.RegisterRoutesWithRoot(mux, handler.CanvasHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Canvas Mode Server is running at http://localhost:%s\n", port)
	fmt.Println("Serving canvas.html with global style.css and local canvas.css")
	fmt.Println("Press Ctrl+C to stop.")

	if err := http.ListenAndServe(":"+port, mux); err != nil {
		fmt.Println("Error starting Canvas server:", err)
	}
}
