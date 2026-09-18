// Package modelio reads saved canvas files and inspects model port metadata.
// See document.md for component inputs, outputs, and test instructions.
package modelio

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"web-app/Canvas/utils/fault"
	"web-app/Canvas/utils/graph"
	"web-app/Canvas/utils/naming"
)

// Load validates companion files and decodes either wrapped or legacy canvas JSON.
func Load(folderPath string) (graph.GraphData, error) {
	cleanFolder := filepath.Clean(folderPath)
	fi, err := os.Stat(cleanFolder)
	if err != nil || !fi.IsDir() {
		return graph.GraphData{}, fault.Invalid("Folder does not exist: " + cleanFolder)
	}

	modelName := filepath.Base(cleanFolder)
	validModelName := modelName
	if !naming.IsValidModelFolderName(modelName) {
		validModelName = naming.FixModelName(modelName)
	}

	jsonPath := filepath.Join(cleanFolder, modelName+".json")
	if _, err := os.Stat(jsonPath); err != nil && validModelName != modelName {
		alt := filepath.Join(cleanFolder, validModelName+".json")
		if _, errAlt := os.Stat(alt); errAlt == nil {
			jsonPath = alt
		}
	}
	pyPath := filepath.Join(cleanFolder, modelName+".py")
	if _, err := os.Stat(pyPath); err != nil && validModelName != modelName {
		alt := filepath.Join(cleanFolder, validModelName+".py")
		if _, errAlt := os.Stat(alt); errAlt == nil {
			pyPath = alt
		}
	}

	if _, err := os.Stat(jsonPath); err != nil {
		return graph.GraphData{}, fault.Invalid(fmt.Sprintf("Model configuration file '%s.json' not found in %s", modelName, cleanFolder))
	}
	if _, err := os.Stat(pyPath); err != nil {
		return graph.GraphData{}, fault.Invalid(fmt.Sprintf("Model python file '%s.py' not found in %s", modelName, cleanFolder))
	}

	jsonBytes, err := os.ReadFile(jsonPath)
	if err != nil {
		return graph.GraphData{}, fault.Internal("Failed to read model json: " + err.Error())
	}

	var rawWrapper map[string]json.RawMessage
	if err := json.Unmarshal(jsonBytes, &rawWrapper); err != nil {
		return graph.GraphData{}, fault.Invalid("Failed to parse model JSON: " + err.Error())
	}

	var graphData graph.GraphData
	if canvasRaw, ok := rawWrapper["canvas"]; ok {
		if err := json.Unmarshal(canvasRaw, &graphData); err != nil {
			return graph.GraphData{}, fault.Invalid("Failed to parse canvas graph data: " + err.Error())
		}
	} else {
		if err := json.Unmarshal(jsonBytes, &graphData); err != nil {
			return graph.GraphData{}, fault.Invalid("Failed to parse graph data: " + err.Error())
		}
	}

	if graphData.Name == "" {
		graphData.Name = validModelName
	} else if !naming.IsValidModelFolderName(graphData.Name) {
		graphData.Name = naming.FixModelName(graphData.Name)
	}

	return graphData, nil
}

// Inspect reports saved-model availability and its input and output ports.
func Inspect(targetPath string) (map[string]interface{}, error) {
	cleanFolder := filepath.Clean(targetPath)
	fi, err := os.Stat(cleanFolder)
	if err != nil || !fi.IsDir() {
		return nil, fault.Invalid("Directory does not exist: " + cleanFolder)
	}

	modelName := filepath.Base(cleanFolder)
	validModelName := naming.FixModelName(modelName)

	jsonPath := filepath.Join(cleanFolder, modelName+".json")
	if _, err := os.Stat(jsonPath); err != nil && validModelName != modelName {
		alt := filepath.Join(cleanFolder, validModelName+".json")
		if _, errAlt := os.Stat(alt); errAlt == nil {
			jsonPath = alt
		}
	}
	pyPath := filepath.Join(cleanFolder, modelName+".py")
	if _, err := os.Stat(pyPath); err != nil && validModelName != modelName {
		alt := filepath.Join(cleanFolder, validModelName+".py")
		if _, errAlt := os.Stat(alt); errAlt == nil {
			pyPath = alt
		}
	}

	if _, err := os.Stat(jsonPath); err != nil {
		return map[string]interface{}{
			"status":  "error",
			"isModel": false,
			"error":   fmt.Sprintf("Missing %s.json", modelName),
		}, nil
	}
	if _, err := os.Stat(pyPath); err != nil {
		return map[string]interface{}{
			"status":  "error",
			"isModel": false,
			"error":   fmt.Sprintf("Missing %s.py", modelName),
		}, nil
	}

	jsonBytes, err := os.ReadFile(jsonPath)
	if err != nil {
		return nil, fault.Internal("Failed to read model JSON: " + err.Error())
	}

	type PortDef struct {
		ID    string      `json:"id"`
		Name  string      `json:"name"`
		Type  string      `json:"type"`
		Shape interface{} `json:"shape"`
	}

	var rootMap map[string]interface{}
	if err := json.Unmarshal(jsonBytes, &rootMap); err != nil {
		return nil, fault.Invalid("Failed to parse model JSON: " + err.Error())
	}

	var inputs []PortDef
	var outputs []PortDef

	var nodesList []interface{}
	if canvasVal, ok := rootMap["canvas"].(map[string]interface{}); ok {
		if cn, ok := canvasVal["nodes"].([]interface{}); ok {
			nodesList = cn
		}
	}
	if len(nodesList) == 0 {
		if rn, ok := rootMap["nodes"].([]interface{}); ok {
			nodesList = rn
		}
	}

	for _, n := range nodesList {
		nMap, ok := n.(map[string]interface{})
		if !ok {
			continue
		}
		lType, _ := nMap["layerType"].(string)
		op, _ := nMap["op"].(string)
		nType, _ := nMap["type"].(string)
		id, _ := nMap["id"].(string)
		label, _ := nMap["label"].(string)
		params, _ := nMap["params"].(map[string]interface{})
		if params == nil {
			params = make(map[string]interface{})
		}

		isInput := strings.EqualFold(lType, "Input") ||
			strings.EqualFold(nType, "input") ||
			strings.EqualFold(op, "placeholder") ||
			strings.HasPrefix(strings.ToLower(label), "input ") ||
			strings.EqualFold(label, "input")

		if isInput {
			name, _ := params["input_name"].(string)
			if name == "" {
				name = id
			}
			itype, _ := params["input_type"].(string)
			if itype == "" {
				itype = "image"
			}
			shape := params["shape"]
			if shape == nil {
				shape = params["custom_shape"]
			}
			if shape == nil {
				shape = []int{3, 224, 224}
			}
			inputs = append(inputs, PortDef{
				ID:    id,
				Name:  name,
				Type:  itype,
				Shape: shape,
			})
		}

		isOutput := strings.EqualFold(op, "output") || strings.EqualFold(lType, "output") || strings.EqualFold(label, "output")
		if isOutput {
			outputs = append(outputs, PortDef{
				ID:    id,
				Name:  "out",
				Type:  "tensor",
				Shape: params["shape"],
			})
		}
	}

	if len(outputs) == 0 && len(nodesList) > 0 {
		lastNode, _ := nodesList[len(nodesList)-1].(map[string]interface{})
		lastID, _ := lastNode["id"].(string)
		outputs = append(outputs, PortDef{
			ID:    lastID,
			Name:  "output",
			Type:  "tensor",
			Shape: []int{1, 10},
		})
	}

	return map[string]interface{}{
		"status":     "ok",
		"isModel":    true,
		"hasInputs":  len(inputs) > 0,
		"modelName":  modelName,
		"folderPath": cleanFolder,
		"inputs":     inputs,
		"outputs":    outputs,
	}, nil
}
