package modelio

import (
	"encoding/json"
	"os"
	"path/filepath"
	"web-app/Canvas/utils/graph"
)

// ReadModelCanvas decodes the exact saved JSON file, accepting wrapped or legacy data.
func ReadModelCanvas(folder string) (graph.GraphData, error) {
	name := filepath.Base(folder)
	data, err := os.ReadFile(filepath.Join(folder, name+".json"))
	if err != nil {
		return graph.GraphData{}, err
	}
	return DecodeCanvas(data)
}

// DecodeCanvas decodes wrapped and legacy files in one JSON pass and repairs
// oversized legacy generated labels before they enter snapshots or responses.
func DecodeCanvas(data []byte) (graph.GraphData, error) {
	var document struct {
		graph.GraphData
		Canvas *graph.GraphData `json:"canvas"`
	}
	if err := json.Unmarshal(data, &document); err != nil {
		return graph.GraphData{}, err
	}
	result := document.GraphData
	if document.Canvas != nil {
		result = *document.Canvas
	}
	graph.RepairLegacyLabels(&result)
	return result, nil
}
