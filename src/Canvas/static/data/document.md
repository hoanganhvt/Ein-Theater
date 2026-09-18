# Browser layer schema data

`modules.json` is the browser-served module catalog requested as `/static/data/modules.json`. Each record describes a layer type, display metadata, category, parameter fields/defaults and label template where applicable. The schema registry in [../js/schemas](../js/schemas/document.md) loads this data into stable in-memory containers. Dialogs and the palette consume that registry.

This is data, not executable UI code, so it remains one registry file. The separate `src/Canvas/data/modules.json` is backend schema data and was not rewritten by the UI refactor. Coordinate changes to both catalogs when adding or changing a layer contract. Do not place DOM markup or event handlers here.

Check JSON syntax and initialize the application after changes. Verify the layer appears in category search, has correct defaults in the parameter dialog and can be persisted through the backend. Network failures preserve the embedded fallback definitions rather than clearing the registry.
