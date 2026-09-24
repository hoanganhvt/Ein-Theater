package session

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"web-app/Canvas/utils/graph"
)

func TestSessionRoundTripAndMissingWorkspace(t *testing.T) {
	dir := t.TempDir()
	workspace := filepath.Join(dir, "Workspace Tiếng Việt")
	if err := os.Mkdir(workspace, 0700); err != nil {
		t.Fatal(err)
	}
	store := graph.NewStore()
	store.Mu.Lock()
	store.WorkingDir = workspace
	first := store.Current()
	first.Name = "Unpublished"
	first.Nodes["input_0"] = graph.Node{ID: "input_0", Label: "Input"}
	first.NodeOrder = []string{"input_0"}
	second := store.CreateProject("Second")
	second.Nodes["linear_0"] = graph.Node{ID: "linear_0", Label: "Linear"}
	second.NodeOrder = []string{"linear_0"}
	store.Mu.Unlock()

	manager := New(dir, store)
	if err := manager.Flush(); err != nil {
		t.Fatal(err)
	}
	restored := graph.NewStore()
	if err := New(dir, restored).Load(); err != nil {
		t.Fatal(err)
	}
	if restored.WorkingDir != workspace || restored.CurrentProjectID != second.ID || len(restored.ProjectOrder) != 2 {
		t.Fatalf("incorrect restored session: %+v", restored)
	}
	if restored.Projects[first.ID].Nodes["input_0"].Label != "Input" || restored.Projects[second.ID].Nodes["linear_0"].Label != "Linear" {
		t.Fatal("unsaved canvas contents were not restored")
	}
	if len(restored.Projects[first.ID].UndoStack) != 0 {
		t.Fatal("undo history must not persist")
	}
	if err := os.Remove(workspace); err != nil {
		t.Fatal(err)
	}
	missingWorkspace := graph.NewStore()
	if err := New(dir, missingWorkspace).Load(); err != nil {
		t.Fatal(err)
	}
	if missingWorkspace.WorkingDir != "" || len(missingWorkspace.Projects[first.ID].Nodes) != 1 {
		t.Fatal("missing workspace should not discard the canvas")
	}
}

func TestConcurrentAutosaveAndCorruptRecovery(t *testing.T) {
	dir := t.TempDir()
	manager := New(dir, graph.NewStore())
	var writes sync.WaitGroup
	for i := 0; i < 8; i++ {
		writes.Add(1)
		go func() {
			defer writes.Done()
			if err := manager.Flush(); err != nil {
				t.Errorf("concurrent flush: %v", err)
			}
		}()
	}
	writes.Wait()
	if err := New(dir, graph.NewStore()).Load(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "session-v1.json"), []byte("{"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := New(dir, graph.NewStore()).Load(); err == nil {
		t.Fatal("corrupt session should be reported")
	}
	matches, err := filepath.Glob(filepath.Join(dir, "session-v1.json.corrupt-*"))
	if err != nil || len(matches) != 1 {
		t.Fatalf("corrupt session not preserved: %v, %v", matches, err)
	}
}
