# HTML escaping and model-name normalization

## Responsibility

`html.js` escapes text inserted into HTML templates. `naming.js` normalizes model names into safe identifiers using the existing naming rules. These helpers do not own application state or perform HTTP requests. Keep their outputs stable because generated HTML and saved model names depend on them.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [html.js](./html.js) | Text escaping for HTML interpolation. |
| [naming.js](./naming.js) | Model-name sanitization for saved identifiers. |

## Module contracts

### html.js

Exports: `esc`.

No module dependencies.

### naming.js

Exports: `fixModelName`.

No module dependencies.

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../utils.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
