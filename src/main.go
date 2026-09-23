package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"web-app/Canvas/handler"
	canvas "web-app/Canvas/mode"
	"web-app/Canvas/utils/python"
	"web-app/studio"
)

var version = "dev"

func main() {
	desktop := os.Getenv("EIN_THEATER_DESKTOP") == "1"
	dataDir := os.Getenv("EIN_THEATER_DATA_DIR")
	token := os.Getenv("EIN_THEATER_AUTH_TOKEN")
	if desktop && (dataDir == "" || token == "") {
		fmt.Fprintln(os.Stderr, "desktop mode requires EIN_THEATER_DATA_DIR and EIN_THEATER_AUTH_TOKEN")
		os.Exit(1)
	}
	if err := handler.ConfigurePersistence(dataDir); err != nil {
		fmt.Fprintln(os.Stderr, "Session restore warning:", err)
	}
	python.Configure(dataDir)
	handler.SetApplicationVersion(version)

	app, err := studio.NewHandler(studioConfig())
	if err != nil {
		panic(err)
	}
	routes := http.NewServeMux()
	handler.RegisterRuntimeRoutes(routes)
	routes.Handle("/", app)
	var root http.Handler = handler.PersistenceMiddleware(routes)
	root = securityHeaders(root)
	if desktop {
		root = requireToken(root, token)
	}

	address := ":" + envDefault("PORT", "8080")
	if desktop {
		address = "127.0.0.1:0"
	}
	listener, err := net.Listen("tcp", address)
	if err != nil {
		panic(err)
	}
	server := &http.Server{Handler: root, ReadHeaderTimeout: 10 * time.Second}
	if desktop {
		ready := map[string]string{"event": "ready", "url": "http://" + listener.Addr().String(), "version": version}
		_ = json.NewEncoder(os.Stdout).Encode(ready)
	} else {
		fmt.Println("Starting Ein Theater Studio...")
		fmt.Println("Server is running at http://localhost:" + envDefault("PORT", "8080"))
	}

	shutdown := make(chan struct{}, 1)
	if desktop {
		go func() {
			_, _ = io.Copy(io.Discard, os.Stdin)
			shutdown <- struct{}{}
		}()
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	go func() {
		select {
		case <-signals:
		case <-shutdown:
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()

	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		fmt.Fprintln(os.Stderr, "Server error:", err)
	}
	python.StopWorker()
	if err := handler.FlushPersistence(); err != nil {
		fmt.Fprintln(os.Stderr, "Session save warning:", err)
	}
}

func envDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func requireToken(next http.Handler, expected string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		provided := r.Header.Get("X-Ein-Theater-Token")
		if len(provided) != len(expected) || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
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
