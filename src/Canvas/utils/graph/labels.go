package graph

import "strings"

// RepairLegacyLabels replaces only oversized, encoding-corrupted integrated-model
// captions. Shape/port data remains in Params; the UI derives its rich caption there.
// Ordinary labels and all model semantics are preserved. No source file is modified.
func RepairLegacyLabels(data *GraphData) {
	for i := range data.Nodes {
		n := &data.Nodes[i]
		if n.LayerType == "IntegratedModel" && len(n.Label) > 4096 && strings.HasPrefix(n.Label, "\u00c3") {
			name, _ := n.Params["model_name"].(string)
			if name == "" {
				name = "Integrated Model"
			}
			n.Label = "IC: " + name + " #" + n.ID
		}
		if n.AdaptedModel != nil {
			RepairLegacyLabels(n.AdaptedModel)
		}
	}
}
