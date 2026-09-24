# Shared component styles

## Ownership and cascade

These files replace the former global monolithic stylesheet. `../style.css` imports them in component order; later feature files may refine shared controls. Both page variants load this entry before Canvas-specific overrides.

## File-by-file responsibilities

### [base.css](./base.css)

Owns base presentation. Selectors: `html, body`, `body`.

### [canvas.css](./canvas.css)

Owns canvas presentation. Selectors: `.canvas-container`, `#mynetwork`, `#mynetwork.drag-over`, `.selection-box`, `.mode-banner`.

### [connections.css](./connections.css)

Owns connections presentation. Selectors: `.header-edge-toolbar`, `.header-edge-title`, `.header-edge-nodes`, `.header-edge-pills`, `.header-edge-actions`, `.btn-edge-pill`, `.btn-edge-pill:hover`, `.btn-edge-pill.active`, `.btn-edge-pill.active-normal`, `.btn-edge-pill.active-residual`, `.btn-edge-pill.active-skip`, `.btn-edge-pill-danger:hover`, `.toolbar-divider-sm`, `.pill-dot`, `.dot-normal`, `.dot-residual`, `.dot-skip`, `.floating-edge-bar`, `from`, `to`, `.floating-edge-drag`, `.floating-edge-info`, `.floating-edge-name`, `.floating-edge-nodes`, `.floating-edge-divider`, `.floating-edge-types`, `.floating-type-btn`, `.floating-type-btn:hover`, `.floating-type-btn.active-normal`, `.floating-type-btn.active-residual`, `.floating-type-btn.active-skip`, `.floating-edge-actions`, `.btn-edge-act`, `.btn-edge-act:hover`, `.btn-edge-act-danger:hover`, `.connections-section`, `.connections-list`, `.connection-item`, `.connection-item:hover`, `.connection-tag-icon`, `#editEdgeModal`, `.edge-nodes-banner`, `.edge-nodes-arrow`, `.section-label`, `.edge-type-cards`, `.edge-card`, `.edge-card:hover`, `.edge-card.selected`, `.edge-card-radio`, `.edge-card-content`, `.edge-card-header`, `.edge-card-content p`, `.edge-card-tag`, `.tag-normal`, `.tag-residual`, `.tag-skip`, `.edge-routing-row select`, `.edge-routing-row select:focus`, `.connect-type-toggle`, `.connect-type-btn`, `.connect-type-btn:hover`, `.connect-type-btn.active`.

### [context-menu.css](./context-menu.css)

Owns context menu presentation. Selectors: `.context-menu`, `.context-menu-item`, `.context-menu-item:hover`, `.context-menu-item.danger`, `.context-menu-item.danger:hover`, `.context-menu-item.disabled`, `.context-menu-item .cm-icon`, `.context-menu-item .cm-text`, `.context-menu-item .cm-shortcut`, `.context-menu-item .cm-check`, `.context-menu-separator`, `.context-menu-item.has-submenu`, `.context-menu-item .cm-arrow`, `.context-submenu`, `.context-submenu.open-left`, `.context-menu-item.has-submenu:hover > .context-submenu`.

### [file-menu.css](./file-menu.css)

Owns file menu presentation. Selectors: `.header-left`, `.header-divider`, `.menu-dropdown`, `.menu-btn`, `.menu-btn:hover, .menu-btn.active`, `.menu-dropdown-content`, `.menu-dropdown-content.open`, `from`, `to`, `.menu-item`, `.menu-item:hover:not(.disabled)`, `.menu-item.disabled`, `.menu-icon`, `.menu-text`, `.menu-badge`, `.menu-separator`, `.menu-item-info`, `.menu-info-label`, `.menu-info-val`.

### [header.css](./header.css)

Owns header presentation, including Electron-only `.window-drag-region`,
`.window-controls`, and `.window-control` states for the frameless window. The
interactive buttons remain outside the draggable region. Also styles the model
title and command toolbar.

### [modals.css](./modals.css)

Owns modals presentation. Selectors: `#modalOverlay`, `#nodeModal`, `#nodeModal h3`, `#nodeModal label`, `#nodeModal select, #nodeModal input`, `#nodeModal select:focus, #nodeModal input:focus`, `.node-modal-search-wrap`, `.node-modal-search-wrap input`, `.node-modal-row`, `.node-modal-col`, `.node-modal-col select`, `.node-preview-card`, `.node-preview-header`, `.node-preview-category`, `.node-preview-label`, `.node-preview-code`, `.modal-footer`, `#editLayerModal`, `.modal-header`, `.modal-header h3`, `.modal-layer-badge`, `.param-group`, `.param-group label`, `.param-group label .param-hint`, `.param-group input, .param-group select`, `.param-group input:focus, .param-group select:focus`, `.param-checkbox-group`, `.param-checkbox-group input[type="checkbox"]`, `.param-checkbox-group label`.

### [modes.css](./modes.css)

Owns modes presentation. Selectors: `.mode-group`, `.mode-group .mode-btn`, `.mode-group .mode-btn:hover`, `.mode-group .mode-btn.active`, `.mode-tabs`, `.mode-tab`, `.mode-tab:hover:not(.disabled)`, `.mode-tab.active`, `.mode-tab.disabled`, `.mode-tab-icon`, `.mode-tab-badge`.

### [notifications.css](./notifications.css)

Owns notifications presentation. Selectors: `.app-toast`, `.app-toast.show`.

### [palette.css](./palette.css)

Owns palette presentation. Selectors: `.palette-list`, `.palette-item`, `.palette-item:hover`, `.palette-item.dragging`, `.palette-badge`, `.badge-blue`, `.badge-green`, `.badge-orange`, `.badge-purple`, `.badge-red`, `.badge-gray`, `.palette-name`, `.drag-handle`, `.custom-palette-item`, `.custom-palette-item:hover`.

### [save-button.css](./save-button.css)

Owns save button presentation. Selectors: `.btn-save`, `.btn-save:hover`, `.btn-save:disabled`.

### [sidebar.css](./sidebar.css)

Owns sidebar presentation. Selectors: `.sidebar`, `.sidebar-section`, `.models-section`, `.palette-section`, `.sidebar-header`, `.sidebar-header h3`, `.palette-hint`, `.btn-new-model`, `.btn-new-model:hover`, `.project-list`, `.palette-list::-webkit-scrollbar`, `.palette-list::-webkit-scrollbar-thumb`, `.project-item`, `.project-item:hover`, `.project-item.active`, `.project-item .project-icon`, `.project-item.active .project-icon`, `.project-item .project-name`, `.project-item.active .project-name`, `.project-item .btn-delete-project`, `.project-item:hover .btn-delete-project`, `.project-item .btn-delete-project:hover`.

### [vis-overrides.css](./vis-overrides.css)

Owns vis overrides presentation. Selectors: `div.vis-network div.vis-close`.

### [workspace-tree.css](./workspace-tree.css)

Owns workspace tree presentation. Selectors: `.workspace-section`, `.btn-change-folder`, `.btn-change-folder:hover`, `.workspace-card`, `.workspace-card:hover`, `.workspace-card-icon`, `.workspace-card-info`, `.workspace-card-name`, `.workspace-card-path`, `.workspace-file-list`, `.workspace-file-item`, `.workspace-file-item:hover`, `.workspace-file-item.is-folder`, `.workspace-file-item.is-model-folder`, `.workspace-file-item.is-model-folder:hover`, `.model-badge`, `.workspace-empty-hint`.

### [workspace.css](./workspace.css)

Owns workspace presentation. Selectors: `.workspace`, `.sidebar-slot`.

## Maintenance

Add a rule to its component owner and check the import order before increasing specificity. Keep shared styles in the global folder and Canvas-only differences in the override folder. Relative URLs resolve from the component stylesheet, not from the HTML page. Use the existing unique `/static/styles/` and `/static/canvas-styles/` prefixes because the server merges two static roots.

Verify both `/` and `/canvas`: header, sidebar, selection box, context menu and all dialogs must retain their layout. The connect banner must accept pointer input. No CSS build step or framework is required.

## Studio visual system

Input: semantic page markup, mode descriptors from the studio registry, and existing Canvas interaction state. Output: a fully dark editor shell with compact application navigation, a model command bar, and a charcoal workspace. No API payloads or model data are changed by these styles.

- `base.css` defines surface, border, text, muted text, and accent tokens; keyboard focus and reduced-motion preferences apply globally.
- `header.css` renders mode navigation and model actions separately. In Electron it
  also styles the custom drag area and window control box; browser pages do not
  mount those controls. Toolbars wrap when space is limited.
- `modes.css` styles registry-provided mode buttons. Planned modes remain disabled; the active mode has an underline and `aria-current`.
- `sidebar.css`, `workspace-tree.css`, and `palette.css` render workspace files, open models, and draggable blocks with consistent spacing. Rows use hover and selection states instead of individual cards. Monospaced category text retains classification without colored badges.
- `save-button.css` uses a restrained light fill for Save. Clear remains a secondary action with a destructive hover state.
- `canvas.css` supplies the dark editor surface. The zoom-aware dot grid is rendered by Canvas circuit drawing code, not a second CSS grid.

### Manual visual and interaction checks

Run `go run .` inside `src`, then inspect both `/` and `/canvas` at 1440px, 1024px, and 640px viewport widths. Confirm a single mode navigation bar, readable project title, dark File dropdown, dark right-click menu and nested submenu, and wrapping edge controls without clipping. Use Tab to verify visible button focus. Open Insert block, expand both category and layer selectors, and test search and custom-layer entry. Check dark native select popups and preview text. Open the native folder picker and both edit dialogs; check input and footer visibility. Create a disposable model, drag a block, select an edge, rename the model, switch models, and use Fit View. Verify planned modes stay disabled. Save only into a disposable folder. Enable reduced motion in browser emulation and confirm decorative transitions stop. In the packaged app, inspect custom controls at normal and maximized sizes and ensure the drag region does not swallow menu or button clicks.

Automated regression checks from the repository root: `node src/static/studio/navigation.test.mjs`, `node src/Canvas/static/js/ui.test.mjs`, and `node src/Canvas/static/js/performance.test.mjs`. These cover navigation and interaction contracts; they do not replace screenshot review.

The root sets `color-scheme: dark` so native form controls and select popups match the application. Canvas drawing has its own colors in `Canvas/static/js/circuit/constants.js` and graph node options; CSS alone cannot theme the drawing surface. Dynamic integrated-model details consume CSS variables, and category selectors use text labels without emoji.
