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
			folders = append(folders, DirectoryItem{
				Name:  name,
				Path:  fullPath,
				IsDir: true,
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
