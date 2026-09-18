// Package fault classifies task failures independently of HTTP.
// See document.md for component inputs, outputs, and test instructions.
package fault

// Error describes a task failure without depending on the HTTP transport.
type Error struct {
	Message      string
	InvalidInput bool
}

func (e *Error) Error() string { return e.Message }

// Invalid reports a request that cannot be processed because its input is invalid.
func Invalid(message string) error { return &Error{Message: message, InvalidInput: true} }

// Internal reports a filesystem or subprocess failure.
func Internal(message string) error { return &Error{Message: message} }
