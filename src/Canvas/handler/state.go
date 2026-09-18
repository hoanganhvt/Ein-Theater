package handler

import (
	"web-app/Canvas/utils/graph"
	"web-app/Canvas/utils/python"
)

var store = graph.NewStore()

// analyzeGraph is the external analysis boundary used by data requests.
var analyzeGraph = python.AnalyzeGraph
