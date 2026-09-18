package modelio

import (
	"encoding/json"
	"strings"
	"testing"
	"web-app/Canvas/utils/graph"
)

func TestDecodeRepairsOnlyInflatedIntegratedCaptions(t *testing.T) {
	corrupt := strings.Repeat("\u00c3\u0192", 10000)
	data := graph.GraphData{Name: "test", Nodes: []graph.Node{
		{ID: "ic_0", LayerType: "IntegratedModel", Label: corrupt, Params: map[string]interface{}{"model_name": "child", "model_path": "child"}},
		{ID: "custom", LayerType: "nn.Linear", Label: corrupt},
		{ID: "ic_1", LayerType: "IntegratedModel", Label: "My custom caption"},
		{ID: "ic_2", LayerType: "IntegratedModel", Label: strings.Repeat("valid", 2000)},
	}}
	for _, wrapped := range []bool{false, true} {
		var input interface{} = data
		if wrapped {
			input = map[string]interface{}{"canvas": data}
		}
		raw, _ := json.Marshal(input)
		got, err := DecodeCanvas(raw)
		if err != nil {
			t.Fatal(err)
		}
		if got.Nodes[0].Label != "IC: child #ic_0" || got.Nodes[0].Params["model_path"] != "child" {
			t.Fatal("legacy caption was not repaired independently of model parameters")
		}
		for i := 1; i < len(data.Nodes); i++ {
			if got.Nodes[i].Label != data.Nodes[i].Label {
				t.Fatalf("ordinary caption %d changed", i)
			}
		}
	}
}
