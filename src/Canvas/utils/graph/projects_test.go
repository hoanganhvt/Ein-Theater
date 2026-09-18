package graph

import (
	"errors"
	"testing"
)

func TestProjectLifecycle(t *testing.T) {
	s := NewStore()
	first := s.Current()
	if !errors.Is(s.DeleteProject(first.ID), ErrLastProject) {
		t.Fatal("last project can be deleted")
	}
	second := s.CreateProject("second")
	if s.Current() != second {
		t.Fatal("new project is not active")
	}
	if s.SwitchProject("missing") || s.Current() != second {
		t.Fatal("invalid switch changed active project")
	}
	if !errors.Is(s.DeleteProject("missing"), ErrProjectNotFound) {
		t.Fatal("missing project error changed")
	}
	if err := s.DeleteProject(second.ID); err != nil {
		t.Fatal(err)
	}
	if s.Current() != first || len(s.ListProjects().Projects) != 1 {
		t.Fatal("deletion did not restore the remaining project")
	}
	third := s.CreateProject("third")
	if third.ID == second.ID {
		t.Fatal("deleted project ID was reused")
	}
}
