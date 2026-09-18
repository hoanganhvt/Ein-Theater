package graph

import (
	"fmt"
	"math"
	"strings"
)

// Paste duplicates graph contents, remapping parents, IDs, and route offsets.
func (p *Project) Paste(req PasteGraphReq) PasteGraphResp {
	idMap := make(map[string]string)
	var createdNodes []Node
	var createdEdges []Edge

	for _, n := range req.Nodes {
		layerType := n.LayerType
		if layerType == "" {
			layerType = n.Label
		}
		newID := p.GetNextNodeID(layerType)
		idMap[n.ID] = newID

		newX := math.Round((n.X+req.Dx)/GridSize) * GridSize
		newY := math.Round((n.Y+req.Dy)/GridSize) * GridSize

		displayName := strings.ReplaceAll(newID, "_", " ")

		var paramsCopy map[string]interface{}
		if n.Params != nil {
			paramsCopy = make(map[string]interface{})
			for k, v := range n.Params {
				paramsCopy[k] = v
			}
		}

		shape := n.Shape
		if shape == "" {
			shape = "box"
		}

		newNode := Node{
			ID:         newID,
			Label:      displayName,
			LayerType:  layerType,
			Shape:      shape,
			Color:      n.Color,
			X:          newX,
			Y:          newY,
			Params:     paramsCopy,
			ParentZone: n.ParentZone,
		}
		p.Nodes[newID] = newNode
		createdNodes = append(createdNodes, newNode)
	}

	// Update parents for nested nodes if parent was also in copied batch
	for i := range createdNodes {
		if oldParent := req.Nodes[i].Parent; oldParent != "" {
			if newParent, ok := idMap[oldParent]; ok {
				createdNodes[i].Parent = newParent
				p.Nodes[createdNodes[i].ID] = createdNodes[i]
			}
		}
	}

	var newEdgeIDs []string
	for _, e := range req.Edges {
		newFrom, okFrom := idMap[e.From]
		newTo, okTo := idMap[e.To]
		if okFrom && okTo {
			newEdgeID := fmt.Sprintf("e%d", p.NextEdgeID)
			p.NextEdgeID++
			newEdgeIDs = append(newEdgeIDs, newEdgeID)

			var newLines []Line
			if len(e.Lines) > 0 {
				for _, l := range e.Lines {
					newLines = append(newLines, Line{
						First: Point{X: l.First.X + req.Dx, Y: l.First.Y + req.Dy},
						Last:  Point{X: l.Last.X + req.Dx, Y: l.Last.Y + req.Dy},
						From:  Point{X: l.From.X + req.Dx, Y: l.From.Y + req.Dy},
						To:    Point{X: l.To.X + req.Dx, Y: l.To.Y + req.Dy},
					})
				}
			} else {
				fn := p.Nodes[newFrom]
				tn := p.Nodes[newTo]
				newLines = ComputeEdgeLinesWithMode(fn, tn, e.FoldMode, e.CustomFold)
			}

			var newCustomFold *float64
			if e.CustomFold != nil {
				val := *e.CustomFold
				if e.FoldMode == "vertical" {
					val += req.Dy
				} else {
					val += req.Dx
				}
				newCustomFold = &val
			}

			newEdge := Edge{
				ID:         newEdgeID,
				From:       newFrom,
				To:         newTo,
				Lines:      newLines,
				EdgeType:   e.EdgeType,
				FoldMode:   e.FoldMode,
				CustomFold: newCustomFold,
			}
			p.Edges[newEdgeID] = newEdge
			p.EdgeOrder = append(p.EdgeOrder, newEdgeID)
		}
	}
	p.ReindexEdges()
	for _, eid := range newEdgeIDs {
		if ed, ok := p.Edges[eid]; ok {
			createdEdges = append(createdEdges, ed)
		}
	}

	return PasteGraphResp{Nodes: createdNodes, Edges: createdEdges}
}
