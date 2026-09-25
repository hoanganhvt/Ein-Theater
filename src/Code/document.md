# Code mode

Code mode edits UTF-8 Python files under the selected workspace and imports traceable PyTorch models into Canvas. The editor uses a textarea with line numbers, Tab indentation, search, dirty-state warning, and separate Save and Compile actions. It can compile the current unsaved buffer. Canvas and Code use the same Go `CurrentProjectID`; changing modes synchronizes the Code buffer into that project's session without writing a `.py` file or compiling a graph.

The mode registers `/code`, `/api/code/*`, and `/static/code/*` through `studio.Mode`. File reads, writes, and deletes require relative `.py` paths under the workspace. Existing files use a SHA-256 hash to detect external changes before writes or deletes. New files are created only when Save is clicked.

`GET/PUT /api/code/active` loads and updates the active project's Code buffer. `POST /api/code/active/bind` associates a file with a project, activating an existing matching project or creating one when needed. Draft source, saved source, file hash, and file association persist in the Go session; mode switches preserve drafts without Save. A Canvas-only project has an empty Code buffer until a Python file is associated with it.

`POST /api/code/classes` parses the buffer to list direct `nn.Module` subclasses. `POST /api/code/compile` runs the trusted local buffer through `torch.fx.symbolic_trace` with a 30-second timeout. It requires a class constructible without arguments, one tensor output, palette-supported `nn` modules, and supported add/cat/getitem operations. Unsupported FX nodes fail before Canvas changes. Only loopback callers can compile. Imported graphs are linked to the source path in the session; recompiling that path requires explicit replacement confirmation.

The Python converter lives in `utils/compile.py`. It emits Canvas `nodes` and `edges`, not model weights. Compiled projects skip automatic shape fitting on display so guessed input dimensions cannot silently alter the traced architecture. Saving a compiled Canvas project remains a separate Canvas operation.
