package handler

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"web-app/Canvas/utils/graph"
)

func TestSavedModelCodeAssociationAndDraft(t *testing.T) {
	previous := store
	store = graph.NewStore()
	t.Cleanup(func() { store = previous })
	folder := filepath.Join(t.TempDir(), "UNet")
	if err := os.Mkdir(folder, 0755); err != nil {
		t.Fatal(err)
	}
	full := filepath.Join(folder, "UNet.py")
	p := store.Current()
	p.Name, p.BaseDir = "UNet", folder // An older session has no CodePath.
	if doc := ActiveCodeDocument(); doc.Path != "" {
		t.Fatalf("missing Python file was associated: %+v", doc)
	}
	if err := os.WriteFile(full, []byte("saved = 1\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if doc := ActiveCodeDocument(); doc.Path != full || doc.ProjectID != p.ID {
		t.Fatalf("legacy model did not find its code: %+v", doc)
	}
	if doc := BindCodeDocument(full); doc.ProjectID != p.ID || len(store.Projects) != 1 {
		t.Fatalf("opening model code created a project: %+v", doc)
	}
	if err := SetCodeDocument(p.ID, full, "draft", "saved = 1\n", "old-hash"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte("saved = 2\n"), 0600); err != nil {
		t.Fatal(err)
	}
	store.Mu.Lock()
	associateModelCode(p, folder)
	store.Mu.Unlock()
	if doc := ActiveCodeDocument(); doc.Source != "draft" || doc.Hash != "old-hash" {
		t.Fatalf("Canvas save discarded dirty Code draft: %+v", doc)
	}
	if err := SetCodeDocument(p.ID, full, "saved = 2\n", "saved = 2\n", "new-hash"); err != nil {
		t.Fatal(err)
	}
	store.Mu.Lock()
	associateModelCode(p, folder)
	store.Mu.Unlock()
	if doc := ActiveCodeDocument(); doc.DraftSet || doc.Path != full {
		t.Fatalf("clean Code buffer was not refreshed: %+v", doc)
	}
}

func TestImportCompiledGraphKeepsOtherProjectsAndRequiresReplace(t *testing.T) {
	previous := store
	store = graph.NewStore()
	t.Cleanup(func() { store = previous })
	initial := store.CurrentProjectID
	data := graph.GraphData{Name: "Model", Nodes: []graph.Node{{ID: "x", LayerType: "Input"}}}
	id, updated, err := ImportCompiledGraph("/workspace/model.py", data, false)
	if err != nil || updated || id == initial {
		t.Fatalf("first import: %q %v %v", id, updated, err)
	}
	if _, _, err := ImportCompiledGraph("/workspace/model.py", data, false); !errors.Is(err, ErrCompiledProjectExists) {
		t.Fatalf("replacement should require confirmation: %v", err)
	}
	bad := graph.GraphData{Name: "Model", Nodes: []graph.Node{{ID: "x", LayerType: "Input"}}, Edges: []graph.Edge{{ID: "e0", From: "missing", To: "x"}}}
	if _, _, err := ImportCompiledGraph("/workspace/model.py", bad, true); err == nil {
		t.Fatal("invalid graph accepted")
	}
	data.Nodes = append(data.Nodes, graph.Node{ID: "linear", LayerType: "nn.Linear"})
	id2, updated, err := ImportCompiledGraph("/workspace/model.py", data, true)
	if err != nil || !updated || id2 != id {
		t.Fatalf("replacement: %q %v %v", id2, updated, err)
	}
	if len(store.Projects) != 2 || len(store.Projects[id].Nodes) != 2 {
		t.Fatal("project state was lost")
	}
}

func TestActiveCodeDraftFollowsProjectWithoutCompile(t *testing.T) {
	previous := store
	store = graph.NewStore()
	t.Cleanup(func() { store = previous })
	first := BindCodeDocument("/workspace/first.py")
	if first.ProjectID != store.CurrentProjectID || first.ReplaceRequired {
		t.Fatalf("first bind: %+v", first)
	}
	if err := SetCodeDocument(first.ProjectID, first.Path, "edited", "saved", "hash"); err != nil {
		t.Fatal(err)
	}
	second := BindCodeDocument("/workspace/second.py")
	if second.ProjectID == first.ProjectID || ActiveCodeDocument().ProjectID != second.ProjectID {
		t.Fatalf("second file did not activate its own project: %+v", second)
	}
	if err := SetCodeDocument(first.ProjectID, first.Path, "stale", "", ""); err == nil {
		t.Fatal("stale project update accepted")
	}
	reopened := BindCodeDocument(first.Path)
	if reopened.ProjectID != first.ProjectID || !reopened.DraftSet || reopened.Source != "edited" {
		t.Fatalf("draft was not restored: %+v", reopened)
	}
	data := graph.GraphData{Name: "First", Nodes: []graph.Node{{ID: "input", LayerType: "Input"}}}
	id, _, err := ImportCompiledGraph(first.Path, data, false)
	if err != nil || id != first.ProjectID {
		t.Fatalf("compile created another project: %q %v", id, err)
	}
}
