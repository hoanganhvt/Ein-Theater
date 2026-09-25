package handler

import (
	"errors"
	"testing"
	"web-app/Canvas/utils/graph"
)

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
