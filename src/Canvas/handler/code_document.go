package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"web-app/Canvas/utils/graph"
	"web-app/Canvas/utils/naming"
)

// modelCodePath returns the Python file generated beside a saved model graph.
func modelCodePath(folder string) string {
	if folder == "" {
		return ""
	}
	name := filepath.Base(folder)
	for _, candidate := range []string{name, naming.FixModelName(name)} {
		full := filepath.Join(folder, candidate+".py")
		info, err := os.Lstat(full)
		if err == nil && info.Mode().IsRegular() {
			return full
		}
	}
	return ""
}

// associateModelCode is called with the store locked. A dirty draft survives
// Canvas saves; an unchanged draft reloads the newly generated file on entry.
func associateModelCode(p *graph.Project, folder string) {
	full := modelCodePath(folder)
	if full == "" {
		return
	}
	previous := p.CodePath
	if previous == "" {
		previous = p.SourcePath
	}
	if previous == full && p.CodeDraftSet && p.CodeDraft != p.CodeSavedSource {
		return
	}
	if previous != full && p.CodeDraftSet && p.CodeDraft != p.CodeSavedSource {
		raw, err := os.ReadFile(full)
		if err != nil {
			return
		}
		sum := sha256.Sum256(raw)
		p.CodeSavedSource, p.CodeHash = string(raw), hex.EncodeToString(sum[:])
	} else {
		p.CodeDraft, p.CodeSavedSource, p.CodeHash, p.CodeDraftSet = "", "", "", false
	}
	p.CodePath = full
}

// ModelCodePaths reports files already represented by a model in Code mode.
func ModelCodePaths() map[string]bool {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	paths := make(map[string]bool)
	for _, p := range store.Projects {
		if p == nil {
			continue
		}
		if p.CodePath == "" && p.SourcePath == "" {
			associateModelCode(p, p.BaseDir)
		}
		if p.CodePath != "" {
			paths[p.CodePath] = true
		}
		if p.SourcePath != "" {
			paths[p.SourcePath] = true
		}
	}
	return paths
}

type CodeDocument struct {
	ProjectID       string
	ProjectName     string
	Path            string
	Source          string
	SavedSource     string
	Hash            string
	DraftSet        bool
	ReplaceRequired bool
}

func documentOf(p *graph.Project) CodeDocument {
	path := p.CodePath
	if path == "" {
		path = p.SourcePath
	}
	return CodeDocument{
		ProjectID: p.ID, ProjectName: p.Name, Path: path, Source: p.CodeDraft,
		SavedSource: p.CodeSavedSource, Hash: p.CodeHash,
		DraftSet:        p.CodeDraftSet,
		ReplaceRequired: p.SourcePath == path && path != "" || len(p.Nodes) > 0 || len(p.Edges) > 0,
	}
}

// ActiveCodeDocument reads the Code buffer of the same project Canvas uses.
func ActiveCodeDocument() CodeDocument {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	p := store.Current()
	if p.CodePath == "" && p.SourcePath == "" {
		associateModelCode(p, p.BaseDir)
	}
	return documentOf(p)
}

// BindCodeDocument activates an existing file's project or associates the file
// with the current project. A second file gets its own project.
func BindCodeDocument(full string) CodeDocument {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	for _, id := range store.ProjectOrder {
		p := store.Projects[id]
		if p != nil && p.CodePath == "" && p.SourcePath == "" {
			associateModelCode(p, p.BaseDir)
		}
		if p != nil && (p.CodePath == full || p.SourcePath == full) {
			p.CodePath = full
			store.CurrentProjectID = id
			return documentOf(p)
		}
	}
	p := store.Current()
	if p.CodePath != "" || p.SourcePath != "" {
		p = store.CreateProject(filepath.Base(full))
	}
	p.CodePath = full
	return documentOf(p)
}

func SetCodeDocument(id, full, source, savedSource, hash string) error {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	if store.CurrentProjectID != id {
		return errors.New("active project changed; reload Code mode")
	}
	p := store.Current()
	path := p.CodePath
	if path == "" {
		path = p.SourcePath
	}
	if path != full {
		return errors.New("active code file changed; reload Code mode")
	}
	p.CodeDraft, p.CodeSavedSource, p.CodeHash, p.CodeDraftSet = source, savedSource, hash, true
	return nil
}

func UnbindCodeDocument(full string) {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	for _, p := range store.Projects {
		if p.CodePath == full || p.SourcePath == full {
			p.CodePath, p.SourcePath = "", ""
			p.CodeDraft, p.CodeSavedSource, p.CodeHash, p.CodeDraftSet = "", "", "", false
		}
	}
}

func CompileTarget(full string) (string, bool) {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	for _, id := range store.ProjectOrder {
		p := store.Projects[id]
		if p != nil && (p.CodePath == full || p.SourcePath == full) {
			return id, p.SourcePath == full || len(p.Nodes) > 0 || len(p.Edges) > 0
		}
	}
	return "", false
}
