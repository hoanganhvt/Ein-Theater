// Package workspace performs directory browsing, creation, and native folder selection.
// See document.md for component inputs, outputs, and test instructions.
package workspace

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"web-app/Canvas/utils/fault"
	"web-app/Canvas/utils/naming"
)

// Browse lists visible files and directories and identifies saved model folders.
func Browse(targetDir string) (BrowseResponse, error) {
	// Fallback if no directory specified or workingDir is empty
	if targetDir == "" {
		if home, err := os.UserHomeDir(); err == nil && home != "" {
			targetDir = home
		} else if cwd, err := os.Getwd(); err == nil && cwd != "" {
			targetDir = cwd
		} else {
			drives := GetSystemDrives()
			if len(drives) > 0 {
				targetDir = drives[0]
			}
		}
	}

	targetDir = filepath.Clean(targetDir)
	fi, err := os.Stat(targetDir)
	if err != nil || !fi.IsDir() {
		return BrowseResponse{}, fault.Invalid("Directory does not exist: " + targetDir)
	}

	entries, err := os.ReadDir(targetDir)
	if err != nil {
		return BrowseResponse{}, fault.Internal("Unable to read directory: " + err.Error())
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
			if naming.IsValidModelFolderName(name) {
				pyFile := filepath.Join(fullPath, name+".py")
				jsonFile := filepath.Join(fullPath, name+".json")
				if fiPy, errPy := os.Stat(pyFile); errPy == nil && !fiPy.IsDir() {
					if fiJSON, errJSON := os.Stat(jsonFile); errJSON == nil && !fiJSON.IsDir() {
						isModel = true
					}
				}
			} else {
				fixed := naming.FixModelName(name)
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
		Drives:  GetSystemDrives(),
		Folders: folders,
		Files:   files,
	}

	return resp, nil
}

// PickFolder opens the Windows folder picker; an empty result means cancellation.
func PickFolder(initialDir string) (string, error) {
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
		return "", fault.Internal("Failed to launch native folder dialog: " + err.Error())
	}

	selected := strings.TrimSpace(string(out))
	return selected, nil
}

// CreateFolder validates the parent and creates a named directory.
func CreateFolder(dir, name string) (map[string]interface{}, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fault.Invalid("Folder name is required")
	}

	if dir == "" {
		return nil, fault.Invalid("Target parent directory is required")
	}

	cleanParent := filepath.Clean(dir)
	fi, err := os.Stat(cleanParent)
	if err != nil || !fi.IsDir() {
		return nil, fault.Invalid("Parent directory does not exist: " + cleanParent)
	}

	newFolderPath := filepath.Join(cleanParent, name)
	if err := os.MkdirAll(newFolderPath, 0755); err != nil {
		return nil, fault.Internal("Failed to create directory: " + err.Error())
	}

	return map[string]interface{}{
		"status": "ok",
		"path":   newFolderPath,
		"name":   name,
		"parent": cleanParent,
	}, nil
}
