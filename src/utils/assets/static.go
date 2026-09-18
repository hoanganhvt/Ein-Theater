// Package assets combines explicitly supplied static filesystems without mode discovery.
package assets

import (
	"net/http"
	"os"
)

type overlay []http.FileSystem

// Overlay searches filesystems in order; the caller supplies ownership and priority.
func Overlay(filesystems ...http.FileSystem) http.FileSystem { return overlay(filesystems) }
func (o overlay) Open(name string) (http.File, error) {
	for _, filesystem := range o {
		if file, err := filesystem.Open(name); err == nil {
			return file, nil
		}
	}
	return nil, os.ErrNotExist
}
