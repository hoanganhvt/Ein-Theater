package modelio

import (
	"encoding/json"
	"os"
	"path/filepath"
	"web-app/Canvas/utils/graph"
)

// ReadModelCanvas decodes the exact saved JSON file, accepting wrapped or legacy data.
func ReadModelCanvas(folder string) (graph.GraphData, error) {
	var graph graph.GraphData
	name := filepath.Base(folder)
	data, err := os.ReadFile(filepath.Join(folder, name+".json"))
	if err != nil {
		return graph, err
	}
	var wrapper map[string]json.RawMessage
	if err = json.Unmarshal(data, &wrapper); err != nil {
		return graph, err
	}
	if canvas, ok := wrapper["canvas"]; ok {
		data = canvas
	}
	err = json.Unmarshal(data, &graph)
	return graph, err
}
