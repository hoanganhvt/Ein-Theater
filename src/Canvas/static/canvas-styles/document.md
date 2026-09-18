# Canvas interaction overrides

## Ownership and cascade

Canvas-specific CSS is imported by `../canvas.css` after the shared stylesheet. The original duplicated stylesheet differed only in the mode banner pointer behavior; that difference is preserved here.

## File-by-file responsibilities

### [interactions.css](./interactions.css)

Owns interactions presentation. Selectors: `.mode-banner`.

## Maintenance

Add a rule to its component owner and check the import order before increasing specificity. Keep shared styles in the global folder and Canvas-only differences in the override folder. Relative URLs resolve from the component stylesheet, not from the HTML page. Use the existing unique `/static/styles/` and `/static/canvas-styles/` prefixes because the server merges two static roots.

Verify both `/` and `/canvas`: header, sidebar, selection box, context menu and all dialogs must retain their layout. The connect banner must accept pointer input. No CSS build step or framework is required.
