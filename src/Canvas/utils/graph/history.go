package graph

import (
	"encoding/json"
	"reflect"
)

// ProjectState contains editable project data. History and revision are excluded.
type ProjectState struct {
	Name       string
	BaseDir    string
	Nodes      map[string]Node
	Edges      map[string]Edge
	NodeOrder  []string
	EdgeOrder  []string
	NextNodeID int
	NextEdgeID int
}

func cloneState(s ProjectState) ProjectState {
	b, _ := json.Marshal(s)
	var copied ProjectState
	_ = json.Unmarshal(b, &copied)
	return copied
}

func (p *Project) State() ProjectState {
	return cloneState(ProjectState{p.Name, p.BaseDir, p.Nodes, p.Edges, p.NodeOrder, p.EdgeOrder, p.NextNodeID, p.NextEdgeID})
}

func (p *Project) restore(s ProjectState) {
	before := p.State()
	s = cloneState(s)
	p.Name, p.BaseDir = s.Name, s.BaseDir
	p.Nodes, p.Edges = s.Nodes, s.Edges
	p.NodeOrder, p.EdgeOrder = s.NodeOrder, s.EdgeOrder
	p.NextNodeID, p.NextEdgeID = s.NextNodeID, s.NextEdgeID
	p.Revision++
	if !reflect.DeepEqual(semantic(before), semantic(s)) {
		p.SemanticRevision++
	}
}

func editable(s ProjectState) ProjectState {
	s = cloneState(s)
	for id, node := range s.Nodes {
		node.TensorInfo = nil
		node.AdaptedModel = nil
		s.Nodes[id] = node
	}
	return s
}

func semantic(s ProjectState) ProjectState {
	s = editable(s)
	s.Name, s.BaseDir = "", ""
	for id, node := range s.Nodes {
		node.X, node.Y = 0, 0
		s.Nodes[id] = node
	}
	for id, edge := range s.Edges {
		edge.Lines, edge.FoldMode, edge.CustomFold = nil, "", nil
		s.Edges[id] = edge
	}
	s.NodeOrder, s.EdgeOrder = nil, nil
	s.NextNodeID, s.NextEdgeID = 0, 0
	return s
}

// RecordEdit adds one step only when the user-editable state changed.
func (p *Project) RecordEdit(before ProjectState) bool {
	if reflect.DeepEqual(editable(before), editable(p.State())) {
		return false
	}
	p.UndoStack = append(p.UndoStack, before)
	if len(p.UndoStack) > 100 {
		p.UndoStack = p.UndoStack[1:]
	}
	p.RedoStack = nil
	p.Revision++
	if !reflect.DeepEqual(semantic(before), semantic(p.State())) {
		p.SemanticRevision++
	}
	return true
}

func (p *Project) Undo() bool {
	if len(p.UndoStack) == 0 {
		return false
	}
	p.RedoStack = append(p.RedoStack, p.State())
	s := p.UndoStack[len(p.UndoStack)-1]
	p.UndoStack = p.UndoStack[:len(p.UndoStack)-1]
	p.restore(s)
	return true
}

func (p *Project) Redo() bool {
	if len(p.RedoStack) == 0 {
		return false
	}
	p.UndoStack = append(p.UndoStack, p.State())
	s := p.RedoStack[len(p.RedoStack)-1]
	p.RedoStack = p.RedoStack[:len(p.RedoStack)-1]
	p.restore(s)
	return true
}

func (p *Project) ResetHistory() {
	p.UndoStack, p.RedoStack = nil, nil
	p.Revision++
	p.SemanticRevision++
}
