import { FALLBACK_MODULES } from './fallback.js';
export const MODULES_LIST = [];

export const LAYER_SCHEMAS = {};

function applyModules(list) {
    MODULES_LIST.length = 0;
    for (const key of Object.keys(LAYER_SCHEMAS)) {
        delete LAYER_SCHEMAS[key];
    }
    list.forEach(item => {
        MODULES_LIST.push(item);
        LAYER_SCHEMAS[item.type] = item;
    });
}

// Seed initial state from fallback
applyModules(FALLBACK_MODULES);

/**
 * Loads module definitions from /static/data/modules.json.
 * Updates MODULES_LIST and LAYER_SCHEMAS.
 */
export async function initSchemas() {
    try {
        const res = await fetch('/static/data/modules.json');
        if (!res.ok) {
            console.warn(`Could not load /static/data/modules.json (HTTP ${res.status}), using fallback schemas`);
            return MODULES_LIST;
        }
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            applyModules(data);
        }
    } catch (err) {
        console.warn('Failed to fetch modules.json, using fallback schemas:', err);
    }
    return MODULES_LIST;
}

/**
 * Retrieves default parameters dictionary for a given layer type.
 */
export function getDefaultParams(layerType) {
    const schema = LAYER_SCHEMAS[layerType];
    if (!schema || !Array.isArray(schema.fields)) return {};
    const res = {};
    schema.fields.forEach(f => { res[f.key] = f.default; });
    return res;
}
