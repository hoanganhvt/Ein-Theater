package handler

import (
	"errors"
	"path/filepath"
	"web-app/Canvas/utils/graph"
)

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
	return documentOf(store.Current())
}

// BindCodeDocument activates an existing file's project or associates the file
// with the current project. A second file gets its own project.
func BindCodeDocument(full string) CodeDocument {
	store.Mu.Lock()
	defer store.Mu.Unlock()
	for _, id := range store.ProjectOrder {
		p := store.Projects[id]
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
