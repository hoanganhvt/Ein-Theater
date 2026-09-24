# Shared template location

This folder is reserved for genuinely mode-independent document fragments or
shells. Application routing lives in [studio](../studio/document.md).

The former index page was a Canvas editor, including node/edge dialogs and Canvas
JavaScript. It now belongs to [Canvas/templates/studio.html](../Canvas/templates/studio.html)
and its [studio fragments](../Canvas/templates/studio/document.md).
The global index handler selects the default mode's Home/Page callback; it does
not read a Canvas file itself or require a universal Canvas-shaped document.

Input: future trusted shared HTML fragments. Output: composed HTML when explicitly
used by a mode or studio renderer. There are currently no shared HTML files here.
Keep this resource directory in the source layout: shared path discovery identifies
the source root using `go.mod` and this folder.

New Data, Code, and Debug pages should live under their own mode directories,
with mode-local scripts/assets. Use shared templates only for shared markup.
Run `go test ./studio ./Canvas/mode -v` from `src` to verify application dispatch
and current page composition. See the studio guide for full extension tests.
