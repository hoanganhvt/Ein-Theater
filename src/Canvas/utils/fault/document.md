# Task failures

Small Go error vocabulary for task utilities. This package has no HTTP dependency.

| Component (`errors.go`) | Input | Output |
| --- | --- | --- |
| `Error` | `Message` and `InvalidInput` fields | Structured task error. `InvalidInput` distinguishes bad arguments or missing requested resources from execution failures. |
| `Error.Error` | Error receiver | Its unchanged message string. |
| `Invalid` | Message | `error` containing `*Error` with `InvalidInput = true`. |
| `Internal` | Message | `error` containing `*Error` with `InvalidInput = false`. |

The HTTP adapter uses `errors.As` and maps invalid task input to 400; internal and
unclassified errors become 500. Existing graph boolean/sentinel errors retain
their endpoint-specific 400/404 mapping. Utilities return errors without writing
responses. Missing companion files in model inspection intentionally remain a
successful result with `isModel: false`, matching the established API.

From `src`, run `go test ./Canvas/handler -run TestWorkspaceModelRoundTrip -v`.
The missing-model request must return 400, and valid filesystem operations must
remain successful.
