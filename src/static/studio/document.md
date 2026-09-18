# Shared studio navigation

`navigation.js` belongs to the application, not to a mode's JavaScript module
graph. A mode opts in with `#appModeTabs`, `body[data-studio-mode]` and a module
script tag pointing to `/static/studio/navigation.js`.

| Component | Input | Output / effects |
| --- | --- | --- |
| `initModeNavigation` | DOM mount, active mode ID, `/api/modes` response | Replaces tabs with registry-ordered buttons. Active button has `aria-current`; planned buttons are disabled; clicking another available mode navigates to its URL. Returns a promise. |
| Module startup | DOM ready state | Initializes immediately or on DOMContentLoaded. No mount is a no-op. Fetch failures are logged and leave existing markup intact. |

No Canvas state, sidebar initialization, graph API or mode-specific dependency is
imported. New mode definitions automatically appear without changing this script.

From the repository root, run `node src/static/studio/navigation.test.mjs`.
Expected: active state, sibling navigation and disabled planned entries pass.
Manual check: run studio, inspect `/api/modes`, then compare its order/availability
with the visible mode menu. Standalone Canvas lists only its registered mode.
