# Shared Studio navigation and desktop controls

`navigation.js` belongs to the application, not to a mode's JavaScript module
graph. A mode opts in with `#appModeTabs`, `body[data-studio-mode]` and a module
script tag pointing to `/static/studio/navigation.js`.

| Component | Input | Output / effects |
| --- | --- | --- |
| `initModeNavigation` | DOM mount, active mode ID, `/api/modes` response | Replaces tabs with registry-ordered buttons. Active button has `aria-current`; planned buttons are disabled; clicking another available mode waits for pending work and then navigates to its URL. Returns a promise. |
| Module startup | DOM ready state | Initializes immediately or on DOMContentLoaded. No mount is a no-op. Fetch failures are logged and leave existing markup intact. |

`menubar.js` dispatches shared File/Edit commands, including Open Folder through
`window.chooseWorkspace`. It calls `mountWindowControls()` from
`window-controls.js`. That module is a no-op in browser development or when the
shared `#studioMenubar` is absent. In Electron it inserts the drag region and
Minimize, Maximize/Restore, and Close buttons, then uses the narrow preload
`window.einDesktop.windowControls` bridge. Maximize events synchronize the button
label/icon even when the window changes state outside a button click. Main-process
IPC verifies that each control request comes from the trusted main frame.

Before navigation, the script awaits `window.waitForCanvasEdits?.()` and
`window.prepareModeSwitch?.(targetModeId)`. Canvas uses the former to finish
graph writes; Code uses the latter to synchronize its active project draft to Go.
If either fails, the page stays open and reports the error. Navigation itself
imports no Canvas state, sidebar initialization, graph API, or mode-specific
dependency. New mode definitions automatically appear without changing this
script. See the [Code mode flow](../../Code/document.md) for draft ownership.

From the repository root, run `node src/static/studio/navigation.test.mjs`.
Expected: active state, sibling navigation and disabled planned entries pass.
Manual check: run studio, inspect `/api/modes`, then compare its order/availability
with the visible mode menu. Standalone Canvas lists only its registered mode.
In the packaged app, verify the native Windows/Electron menu and titlebar are
absent; drag the custom header and test minimize, maximize, restore, and close on
Canvas and a shell mode. Browser development must not show app window controls.
