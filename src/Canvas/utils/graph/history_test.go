package graph

import "testing"

func TestHistoryRoundTripAndBranches(t *testing.T) {
	p := NewStore().Current()
	before := p.State()
	n := p.AddNode("", "nn.Linear", "box", 10, 20, map[string]interface{}{"nested": map[string]interface{}{"size": 4}})
	if !p.RecordEdit(before) || len(p.UndoStack) != 1 {
		t.Fatal("add did not record")
	}
	before = p.State()
	p.MoveNode(n.ID, 70, 90, false)
	p.RecordEdit(before)
	if !p.Undo() || p.Nodes[n.ID].X != 10 {
		t.Fatal("move undo failed")
	}
	if !p.Undo() || len(p.Nodes) != 0 {
		t.Fatal("add undo failed")
	}
	if !p.Redo() || len(p.Nodes) != 1 {
		t.Fatal("redo failed")
	}
	before = p.State()
	p.AddNode("", "nn.ReLU", "box", 0, 0, nil)
	p.RecordEdit(before)
	if p.Redo() {
		t.Fatal("new edit must clear redo")
	}
	if len(p.UndoStack) != 2 {
		t.Fatal("wrong history length")
	}
	// Stored nested parameters must not alias live maps.
	for _, saved := range p.UndoStack {
		if node, ok := saved.Nodes[n.ID]; ok {
			original := node.Params["nested"].(map[string]interface{})["size"]
			p.Nodes[n.ID].Params["nested"].(map[string]interface{})["size"] = 9
			if node.Params["nested"].(map[string]interface{})["size"] != original {
				t.Fatal("history aliases live params")
			}
			break
		}
	}
}

func TestHistoryNoOpAndLimit(t *testing.T) {
	p := NewStore().Current()
	if p.RecordEdit(p.State()) {
		t.Fatal("no-op recorded")
	}
	for i := 0; i < 105; i++ {
		before := p.State()
		p.Name += "x"
		p.RecordEdit(before)
	}
	if len(p.UndoStack) != 100 {
		t.Fatal("history is not bounded")
	}
	p.ResetHistory()
	if len(p.UndoStack) != 0 || len(p.RedoStack) != 0 {
		t.Fatal("reset failed")
	}
}

func TestSemanticRevisionSurvivesUndoBackToSameGraph(t *testing.T) {
	p := NewStore().Current()
	initial := p.SemanticRevision
	before := p.State()
	n := p.AddNode("", "Input", "box", 0, 0, nil)
	p.RecordEdit(before)
	if p.SemanticRevision <= initial {
		t.Fatal("add must advance semantic revision")
	}
	semanticAfterAdd := p.SemanticRevision
	before = p.State()
	p.MoveNode(n.ID, 50, 50, false)
	p.RecordEdit(before)
	if p.SemanticRevision != semanticAfterAdd {
		t.Fatal("layout should not advance semantic revision")
	}
	if !p.Undo() || p.SemanticRevision != semanticAfterAdd {
		t.Fatal("layout undo should not advance semantic revision")
	}
	if !p.Undo() || p.SemanticRevision <= semanticAfterAdd {
		t.Fatal("semantic undo must advance revision even when graph returns to its earlier state")
	}
}
