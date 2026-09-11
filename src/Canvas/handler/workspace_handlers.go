package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func getSystemDrives() []string {
	var drives []string
	for _, letter := range "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
		drive := string(letter) + ":\\"
		if _, err := os.Stat(drive); err == nil {
			drives = append(drives, drive)
		}
	}
	return drives
}

// WorkspaceHandler returns the current working directory.
func WorkspaceHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	wd := workingDir
	mu.Unlock()

	name := "None"
	if wd != "" {
		name = filepath.Base(wd)
	}

	resp := WorkspaceResponse{
		WorkingDir: wd,
		Name:       name,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// SetWorkspaceHandler updates the active working directory.
func SetWorkspaceHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		var body struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			path = body.Path
		}
	}

	path = strings.TrimSpace(path)
	if path == "" {
		http.Error(w, "Directory path is required", http.StatusBadRequest)
		return
	}

	cleanPath := filepath.Clean(path)
	fi, err := os.Stat(cleanPath)
	if err != nil {
		http.Error(w, "Directory does not exist: "+err.Error(), http.StatusBadRequest)
		return
	}
	if !fi.IsDir() {
		http.Error(w, "Path is not a directory", http.StatusBadRequest)
		return
	}

	mu.Lock()
	workingDir = cleanPath
	mu.Unlock()

	resp := WorkspaceResponse{
		WorkingDir: cleanPath,
		Name:       filepath.Base(cleanPath),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// BrowseWorkspaceHandler lists files and subfolders in the requested path.
func BrowseWorkspaceHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	targetDir := r.URL.Query().Get("dir")
	if targetDir == "" {
		targetDir = workingDir
	}
	mu.Unlock()

	// Fallback if no directory specified or workingDir is empty
	if targetDir == "" {
		if home, err := os.UserHomeDir(); err == nil && home != "" {
			targetDir = home
		} else if cwd, err := os.Getwd(); err == nil && cwd != "" {
			targetDir = cwd
		} else {
			drives := getSystemDrives()
			if len(drives) > 0 {
				targetDir = drives[0]
			}
		}
	}

	targetDir = filepath.Clean(targetDir)
	fi, err := os.Stat(targetDir)
	if err != nil || !fi.IsDir() {
		http.Error(w, "Directory does not exist: "+targetDir, http.StatusBadRequest)
		return
	}

	entries, err := os.ReadDir(targetDir)
	if err != nil {
		http.Error(w, "Unable to read directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	folders := make([]DirectoryItem, 0)
	files := make([]DirectoryItem, 0)

	for _, entry := range entries {
		name := entry.Name()
		// Skip hidden files/directories
		if strings.HasPrefix(name, ".") {
			continue
		}
		fullPath := filepath.Join(targetDir, name)
		if entry.IsDir() {
			isModel := false
			modelName := name
			if IsValidModelFolderName(name) {
				pyFile := filepath.Join(fullPath, name+".py")
				jsonFile := filepath.Join(fullPath, name+".json")
				if fiPy, errPy := os.Stat(pyFile); errPy == nil && !fiPy.IsDir() {
					if fiJSON, errJSON := os.Stat(jsonFile); errJSON == nil && !fiJSON.IsDir() {
						isModel = true
					}
				}
			} else {
				fixed := FixModelName(name)
				pyFile1 := filepath.Join(fullPath, name+".py")
				jsonFile1 := filepath.Join(fullPath, name+".json")
				pyFile2 := filepath.Join(fullPath, fixed+".py")
				jsonFile2 := filepath.Join(fullPath, fixed+".json")

				if fiPy, errPy := os.Stat(pyFile1); errPy == nil && !fiPy.IsDir() {
					if fiJSON, errJSON := os.Stat(jsonFile1); errJSON == nil && !fiJSON.IsDir() {
						isModel = true
						modelName = fixed
					}
				}
				if !isModel {
					if fiPy, errPy := os.Stat(pyFile2); errPy == nil && !fiPy.IsDir() {
						if fiJSON, errJSON := os.Stat(jsonFile2); errJSON == nil && !fiJSON.IsDir() {
							isModel = true
							modelName = fixed
						}
					}
				}
			}
			folders = append(folders, DirectoryItem{
				Name:      name,
				Path:      fullPath,
				IsDir:     true,
				IsModel:   isModel,
				ModelName: modelName,
			})
		} else {
			info, _ := entry.Info()
			var size int64
			if info != nil {
				size = info.Size()
			}
			files = append(files, DirectoryItem{
				Name:  name,
				Path:  fullPath,
				IsDir: false,
				Size:  size,
			})
		}
	}

	parent := filepath.Dir(targetDir)
	if parent == targetDir {
		parent = ""
	}

	resp := BrowseResponse{
		Current: targetDir,
		Parent:  parent,
		Drives:  getSystemDrives(),
		Folders: folders,
		Files:   files,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// SelectNativeFolderHandler opens the Windows native folder picker.
func SelectNativeFolderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	mu.Lock()
	initialDir := workingDir
	mu.Unlock()

	psScript := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Working Directory"
$dialog.SelectedPath = "%s"
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}
`, strings.ReplaceAll(initialDir, `"`, `\"`))

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", psScript)
	out, err := cmd.Output()
	if err != nil {
		http.Error(w, "Failed to launch native folder dialog: "+err.Error(), http.StatusInternalServerError)
		return
	}

	selected := strings.TrimSpace(string(out))
	if selected == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"cancelled": true,
		})
		return
	}

	cleanPath := filepath.Clean(selected)
	fi, err := os.Stat(cleanPath)
	if err != nil || !fi.IsDir() {
		http.Error(w, "Selected path is not a valid directory", http.StatusBadRequest)
		return
	}

	mu.Lock()
	workingDir = cleanPath
	mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cancelled":  false,
		"workingDir": cleanPath,
		"name":       filepath.Base(cleanPath),
	})
}

func findGenCodePyPath() string {
	candidates := []string{
		filepath.Join("Canvas", "utils", "generate code", "gen_code.py"),
		filepath.Join("src", "Canvas", "utils", "generate code", "gen_code.py"),
		filepath.Join("utils", "generate code", "gen_code.py"),
		filepath.Join("src", "utils", "generate code", "gen_code.py"),
		filepath.Join("..", "Canvas", "utils", "generate code", "gen_code.py"),
		filepath.Join("..", "src", "Canvas", "utils", "generate code", "gen_code.py"),
		filepath.Join("..", "src", "utils", "generate code", "gen_code.py"),
		filepath.Join("..", "utils", "generate code", "gen_code.py"),
		filepath.Join("..", "idea", "test.py"),
		filepath.Join("idea", "test.py"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			abs, err := filepath.Abs(c)
			if err == nil {
				return abs
			}
			return c
		}
	}
	return filepath.Join("Canvas", "utils", "generate code", "gen_code.py")
}

// CreateFolderHandler creates a new folder within the specified or active directory.
func CreateFolderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Dir  string `json:"dir"`
		Name string `json:"name"`
	}

	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if req.Name == "" {
		req.Name = r.URL.Query().Get("name")
	}
	if req.Dir == "" {
		req.Dir = r.URL.Query().Get("dir")
	}

	mu.Lock()
	if req.Dir == "" {
		req.Dir = workingDir
	}
	mu.Unlock()

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		http.Error(w, "Folder name is required", http.StatusBadRequest)
		return
	}

	if req.Dir == "" {
		http.Error(w, "Target parent directory is required", http.StatusBadRequest)
		return
	}

	cleanParent := filepath.Clean(req.Dir)
	fi, err := os.Stat(cleanParent)
	if err != nil || !fi.IsDir() {
		http.Error(w, "Parent directory does not exist: "+cleanParent, http.StatusBadRequest)
		return
	}

	newFolderPath := filepath.Join(cleanParent, req.Name)
	if err := os.MkdirAll(newFolderPath, 0755); err != nil {
		http.Error(w, "Failed to create directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"path":   newFolderPath,
		"name":   req.Name,
		"parent": cleanParent,
	})
}

// SaveModelHandler serializes the current project, invokes src/utils/generate code/gen_code.py to generate code,
// and saves <model_name>/<model_name>.json and <model_name>/<model_name>.py.
func SaveModelHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProjectID string `json:"projectId"`
		Dir       string `json:"dir"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if req.ProjectID == "" {
		req.ProjectID = r.URL.Query().Get("projectId")
	}
	if req.Dir == "" {
		req.Dir = r.URL.Query().Get("dir")
	}

	mu.Lock()
	targetDir := req.Dir
	if targetDir == "" {
		targetDir = workingDir
	}

	p := cur()
	if req.ProjectID != "" {
		if found, ok := projects[req.ProjectID]; ok {
			p = found
		}
	}

	if p == nil {
		mu.Unlock()
		http.Error(w, "No active project found", http.StatusBadRequest)
		return
	}

	if !IsValidModelFolderName(p.Name) {
		p.Name = FixModelName(p.Name)
	}

	// Prepare graph data
	nodesList := make([]Node, 0, len(p.nodes))
	for _, n := range p.nodes {
		nodesList = append(nodesList, n)
	}
	edgesList := make([]Edge, 0, len(p.edges))
	for _, e := range p.edges {
		edgesList = append(edgesList, e)
	}

	graphPayload := GraphData{
		ProjectID: p.ID,
		Name:      p.Name,
		Nodes:     nodesList,
		Edges:     edgesList,
	}
	mu.Unlock()

	if targetDir == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "No working directory selected. Please select a folder first.",
		})
		return
	}

	cleanTarget := filepath.Clean(targetDir)
	if fi, err := os.Stat(cleanTarget); err != nil || !fi.IsDir() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Working directory does not exist: " + cleanTarget,
		})
		return
	}

	canvasBytes, err := json.Marshal(graphPayload)
	if err != nil {
		http.Error(w, "Failed to serialize canvas data: "+err.Error(), http.StatusInternalServerError)
		return
	}

	genCodePyPath := findGenCodePyPath()
	cmd := exec.Command("python", genCodePyPath, "--save-canvas", "-", "--out-dir", cleanTarget)
	cmd.Stdin = strings.NewReader(string(canvasBytes))
	out, err := cmd.CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("Python model generation error (%v): %s", err, string(out)), http.StatusInternalServerError)
		return
	}

	outStr := strings.TrimSpace(string(out))
	var result map[string]interface{}
	if jsonErr := json.Unmarshal([]byte(outStr), &result); jsonErr != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "ok",
			"raw":    outStr,
			"folder": filepath.Join(cleanTarget, p.Name),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// LoadModelHandler loads a model from a folder containing <model_name>.json and <model_name>.py
// onto the active canvas.
func LoadModelHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Path string `json:"path"`
		Dir  string `json:"dir"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	folderPath := req.Path
	if folderPath == "" {
		folderPath = req.Dir
	}
	if folderPath == "" {
		folderPath = r.URL.Query().Get("path")
	}
	if folderPath == "" {
		folderPath = r.URL.Query().Get("dir")
	}

	folderPath = strings.TrimSpace(folderPath)
	if folderPath == "" {
		http.Error(w, "Model folder path is required", http.StatusBadRequest)
		return
	}

	cleanFolder := filepath.Clean(folderPath)
	fi, err := os.Stat(cleanFolder)
	if err != nil || !fi.IsDir() {
		http.Error(w, "Folder does not exist: "+cleanFolder, http.StatusBadRequest)
		return
	}

	modelName := filepath.Base(cleanFolder)
	validModelName := modelName
	if !IsValidModelFolderName(modelName) {
		validModelName = FixModelName(modelName)
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
		http.Error(w, fmt.Sprintf("Model configuration file '%s.json' not found in %s", modelName, cleanFolder), http.StatusBadRequest)
		return
	}
	if _, err := os.Stat(pyPath); err != nil {
		http.Error(w, fmt.Sprintf("Model python file '%s.py' not found in %s", modelName, cleanFolder), http.StatusBadRequest)
		return
	}

	jsonBytes, err := os.ReadFile(jsonPath)
	if err != nil {
		http.Error(w, "Failed to read model json: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var rawWrapper map[string]json.RawMessage
	if err := json.Unmarshal(jsonBytes, &rawWrapper); err != nil {
		http.Error(w, "Failed to parse model JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	var graphData GraphData
	if canvasRaw, ok := rawWrapper["canvas"]; ok {
		if err := json.Unmarshal(canvasRaw, &graphData); err != nil {
			http.Error(w, "Failed to parse canvas graph data: "+err.Error(), http.StatusBadRequest)
			return
		}
	} else {
		if err := json.Unmarshal(jsonBytes, &graphData); err != nil {
			http.Error(w, "Failed to parse graph data: "+err.Error(), http.StatusBadRequest)
			return
		}
	}

	if graphData.Name == "" {
		graphData.Name = validModelName
	} else if !IsValidModelFolderName(graphData.Name) {
		graphData.Name = FixModelName(graphData.Name)
	}
	modelName = graphData.Name

	mu.Lock()
	defer mu.Unlock()

	var p *Project
	active := cur()
	if active != nil && len(active.nodes) == 0 && (active.Name == "Untitled Model" || active.Name == modelName) {
		p = active
		p.Name = modelName
	} else {
		for _, proj := range projects {
			if proj.Name == modelName {
				p = proj
				currentProjectID = p.ID
				break
			}
		}
		if p == nil {
			p = makeProject(modelName)
			projects[p.ID] = p
			projectOrder = append(projectOrder, p.ID)
			currentProjectID = p.ID
		}
	}

	p.nodes = make(map[string]Node)
	p.edges = make(map[string]Edge)

	for _, n := range graphData.Nodes {
		if strings.Contains(n.ID, "_") {
			n.Label = strings.ReplaceAll(n.ID, "_", " ")
		} else {
			prefix := layerTypeToPrefix(n.LayerType)
			if n.ID != "" {
				n.Label = fmt.Sprintf("%s %s", prefix, n.ID)
			} else {
				n.Label = prefix
			}
		}
		p.nodes[n.ID] = n
	}

	for _, e := range graphData.Edges {
		if len(e.Lines) == 0 {
			fn, ok1 := p.nodes[e.From]
			tn, ok2 := p.nodes[e.To]
			if ok1 && ok2 {
				e.Lines = ComputeEdgeLines(fn, tn)
			}
		}
		p.edges[e.ID] = e
	}

	p.nextEdgeID = len(p.edges)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"modelName": p.Name,
		"projectId": p.ID,
		"nodeCount": len(p.nodes),
		"edgeCount": len(p.edges),
	})
}

