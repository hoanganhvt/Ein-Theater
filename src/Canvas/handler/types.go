package handler

import (
	"web-app/Canvas/utils/graph"
	"web-app/Canvas/utils/workspace"
)

// Shared transport types retain their original handler package names.
type Point = graph.Point
type Line = graph.Line
type TensorInfo = graph.TensorInfo
type Node = graph.Node
type Edge = graph.Edge
type ProjectMeta = graph.ProjectMeta
type GraphData = graph.GraphData
type Project = graph.Project
type WorkspaceResponse = workspace.WorkspaceResponse
type DirectoryItem = workspace.DirectoryItem
type BrowseResponse = workspace.BrowseResponse
