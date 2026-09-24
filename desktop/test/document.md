# Electron security regression checks

`security.test.mjs` is a source-level guard for the narrow preload bridge and
BrowserWindow settings. It checks that the preload exposes directory selection,
Python executable selection, and window-control methods without exposing Node's
filesystem or process object. It also checks sandbox/context isolation, disabled
Node integration, the frameless window, removed application menu, native directory
picker, and loopback token header in the main process.

From `desktop/`, run `node --test test/security.test.mjs` or `npm.cmd test`.
These checks are static assertions, not a substitute for the packaged smoke or
manual testing of native dialogs and window controls on Windows.
