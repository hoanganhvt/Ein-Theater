package workspace

type WorkspaceResponse struct {
	WorkingDir string `json:"workingDir"`
	Name       string `json:"name"`
}

type DirectoryItem struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	IsDir     bool   `json:"isDir"`
	Size      int64  `json:"size,omitempty"`
	IsModel   bool   `json:"isModel"`
	ModelName string `json:"modelName,omitempty"`
}

type BrowseResponse struct {
	Current string          `json:"current"`
	Parent  string          `json:"parent"`
	Drives  []string        `json:"drives,omitempty"`
	Folders []DirectoryItem `json:"folders"`
	Files   []DirectoryItem `json:"files"`
}
