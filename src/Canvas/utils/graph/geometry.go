package graph

import (
	"math"
)

const GridSize = 50.0

// ComputeEdgeLines computes orthogonal straight line segments (circuit traces)
// connecting fromNode to toNode on the electrical circuit grid using default horizontal Z-bend.
func ComputeEdgeLines(from Node, to Node) []Line {
	return ComputeEdgeLinesWithMode(from, to, "horizontal", nil)
}

// ComputeEdgeLinesWithMode computes orthogonal straight line segments connecting fromNode to toNode
// according to foldMode ("horizontal", "vertical", "l-horizontal", "l-vertical") and optional customFold coordinate.
func ComputeEdgeLinesWithMode(from Node, to Node, foldMode string, customFold *float64) []Line {
	x1, y1 := from.X, from.Y
	x2, y2 := to.X, to.Y

	if x1 == x2 && y1 == y2 {
		return []Line{}
	}

	makeLine := func(px1, py1, px2, py2 float64) Line {
		p1 := Point{X: px1, Y: py1}
		p2 := Point{X: px2, Y: py2}
		return Line{First: p1, Last: p2, From: p1, To: p2}
	}

	// 1. Single straight horizontal line
	if y1 == y2 {
		return []Line{makeLine(x1, y1, x2, y2)}
	}

	// 2. Single straight vertical line
	if x1 == x2 {
		return []Line{makeLine(x1, y1, x2, y2)}
	}

	// 3. L-bends
	if foldMode == "l-horizontal" {
		return []Line{
			makeLine(x1, y1, x2, y1),
			makeLine(x2, y1, x2, y2),
		}
	}
	if foldMode == "l-vertical" {
		return []Line{
			makeLine(x1, y1, x1, y2),
			makeLine(x1, y2, x2, y2),
		}
	}

	// 4. Z-bends
	if foldMode == "vertical" {
		foldY := math.Round(((y1+y2)/2.0)/GridSize) * GridSize
		if customFold != nil {
			foldY = *customFold
		}
		if foldY == y1 || foldY == y2 {
			return []Line{
				makeLine(x1, y1, x1, y2),
				makeLine(x1, y2, x2, y2),
			}
		}
		return []Line{
			makeLine(x1, y1, x1, foldY),
			makeLine(x1, foldY, x2, foldY),
			makeLine(x2, foldY, x2, y2),
		}
	}

	// Default: "horizontal" Z-bend (horizontal -> vertical -> horizontal)
	foldX := math.Round(((x1+x2)/2.0)/GridSize) * GridSize
	if customFold != nil {
		foldX = *customFold
	}
	if foldX == x1 || foldX == x2 {
		return []Line{
			makeLine(x1, y1, x2, y1),
			makeLine(x2, y1, x2, y2),
		}
	}
	return []Line{
		makeLine(x1, y1, foldX, y1),
		makeLine(foldX, y1, foldX, y2),
		makeLine(foldX, y2, x2, y2),
	}
}
