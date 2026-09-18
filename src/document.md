# Source folders

- `main.go` starts the studio server; [templates](./templates/document.md) owns its document shell and partials.
- [static](./static/document.md) owns shared CSS and component styles.
- [Canvas](./Canvas/document.md) contains the standalone entry, backend handlers, Python utilities and Canvas UI.

The detailed [UI source audit](./Canvas/static/document.md) classifies every original frontend file and links each feature folder. UI JavaScript is served directly as native ES modules; no bundler is required. HTML partials are composed by the Go handler before sending pages. Backend graph and Python responsibilities remain separate from the frontend refactor.

Run `go run .` here for the studio or `go run .` from `Canvas` for the standalone entry. Run `go test ./...` here and the two frontend `.test.mjs` scripts from the repository root.
