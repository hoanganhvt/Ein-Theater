# Utility regression tests

These tests use Python's standard-library `unittest` runner and require PyTorch.
Activate the Python environment containing PyTorch before running them.

| File | Coverage |
| --- | --- |
| `test_codegen.py` | Disconnected layers, package imports, dynamic loading, save CLI |
| `test_shape_inference.py` | Meta tensors, adapters, invalid branches, cycles, nested models, worker protocol |
| `bootstrap.py` | Add the utility and generation directories to the test import path |

## Run all tests

In PowerShell, starting at the repository root:

```powershell
Set-Location 'src/Canvas/utils/tests'
python -B -m unittest discover -s . -p 'test_*.py' -v
```

Expected: each test reports `ok`, followed by `OK`. A failure returns a nonzero exit
code. Tests use temporary directories for saved models and start short-lived Python
subprocesses to verify CLI/worker behavior.

## Run each file's main

Both test files provide `if __name__ == '__main__': unittest.main()`:

```powershell
python -B test_codegen.py -v
python -B test_shape_inference.py -v
```

`bootstrap.py` is an import helper, not a runnable test or application entry point.

## Run one regression

From this directory:

```powershell
python -B -m unittest test_codegen.CodeGenerationTests.test_disconnected_module_is_initialized_but_not_called -v
python -B -m unittest test_shape_inference.IntegratedTests.test_worker_handles_multiple_requests_and_recovers_after_invalid_json -v
```

## Troubleshooting

- `python` not found: use the installed interpreter's full path, or replace `python`
  with `py` if the Windows launcher has an interpreter registered.
- `No module named torch`: select the environment with PyTorch. All subprocess tests
  reuse `sys.executable`, so the parent interpreter must be configured correctly.
- `No module named test_codegen`: run the single-test command from this directory.
- Palette-related errors: keep `src/Canvas/data/modules.json` in the repository layout.

See [utility architecture](../document.md) for package responsibilities.
