# Dynamic sidebar loading and application navigation

## Responsibility

`loading.js` fetches the sidebar HTML endpoint, mounts the composed fragment and initializes workspace, projects and palette. It tracks the active sidebar mode and emits `sidebar:loaded`. `navigation.js` is the legacy Canvas navigation callback: Canvas reloads its sidebar; another available mode is resolved through `/api/modes` and receives full-page navigation. Planned modes show an informational alert. The main menu is owned by [shared studio navigation](../../../../static/studio/document.md). The server composes sidebar partials before returning them, so the client does not fetch each partial separately.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [loading.js](./loading.js) | Sidebar HTTP loading, mounting, initialization and active mode tracking. |
| [navigation.js](./navigation.js) | Application mode tab updates and supported-mode dispatch. |

## Module contracts

### loading.js

Exports: `loadSidebar`, `getActiveSidebarMode`.

Dependencies: [../palette.js](../palette.js), [../workspace.js](../workspace.js), [../projects.js](../projects.js).

### navigation.js

Exports: `switchMode`.

Dependencies: [./loading.js](./loading.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../sidebarLoader.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
