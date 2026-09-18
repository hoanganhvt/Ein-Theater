# Layer registry, fallback definitions and display labels

## Responsibility

`fallback.js` contains embedded schema definitions used before or when the registry request fails. `registry.js` seeds and updates the stable `MODULES_LIST` array and `LAYER_SCHEMAS` object, loading `/static/data/modules.json`. Mutate those existing containers instead of replacing their identities. `labels.js` handles base type resolution, clean instance names and template rendering. Add schema data to the registry rather than hard-coding new form fields in consumers.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [fallback.js](./fallback.js) | Embedded registry used during initialization and fetch failure. |
| [labels.js](./labels.js) | Layer names, instance labels and label-template evaluation. |
| [registry.js](./registry.js) | Stable schema containers, JSON loading and default parameters. |

## Module contracts

### fallback.js

Exports: `FALLBACK_MODULES`.

No module dependencies.

### labels.js

Exports: `getLayerBaseType`, `renderLabelTemplate`, `getNodeDisplayName`, `formatNodeLabel`.

No module dependencies.

### registry.js

Exports: `MODULES_LIST`, `LAYER_SCHEMAS`, `initSchemas`, `getDefaultParams`.

Dependencies: [./fallback.js](./fallback.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../schemas.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
