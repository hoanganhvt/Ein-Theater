// ── Layer Parameter Schemas & Helpers ────────────────────────────
// Loads module specifications dynamically from /static/data/modules.json
// with an embedded fallback for resilience and offline support.

// Internal default definitions used before or in case JSON fetch fails
const FALLBACK_MODULES = [
    {
        type: 'nn.Linear',
        name: 'nn.Linear',
        category: 'dense',
        badge: 'dense',
        badgeClass: 'badge-blue',
        defaultInSeed: true,
        labelTemplate: '{type}\n({in_features} → {out_features})',
        fields: [
            { key: 'in_features', label: 'in_features', type: 'number', default: 128, min: 1 },
            { key: 'out_features', label: 'out_features', type: 'number', default: 64, min: 1 },
            { key: 'bias', label: 'bias', type: 'boolean', default: true }
        ]
    },
    {
        type: 'nn.Conv2d',
        name: 'nn.Conv2d',
        category: 'conv',
        badge: 'conv',
        badgeClass: 'badge-green',
        defaultInSeed: true,
        labelTemplate: '{type}\n({in_channels}→{out_channels}, k={kernel_size})',
        fields: [
            { key: 'in_channels', label: 'in_channels', type: 'number', default: 3, min: 1 },
            { key: 'out_channels', label: 'out_channels', type: 'number', default: 64, min: 1 },
            { key: 'kernel_size', label: 'kernel_size', type: 'number', default: 3, min: 1 },
            { key: 'stride', label: 'stride', type: 'number', default: 1, min: 1 },
            { key: 'padding', label: 'padding', type: 'number', default: 1, min: 0 },
            { key: 'bias', label: 'bias', type: 'boolean', default: true }
        ]
    },
    {
        type: 'nn.ReLU',
        name: 'nn.ReLU',
        category: 'activation',
        badge: 'act',
        badgeClass: 'badge-orange',
        defaultInSeed: true,
        labelTemplate: '{type}{#inplace}\n(inplace){/inplace}',
        fields: [
            { key: 'inplace', label: 'inplace', type: 'boolean', default: false }
        ]
    },
    {
        type: 'nn.MaxPool2d',
        name: 'nn.MaxPool2d',
        category: 'pooling',
        badge: 'pool',
        badgeClass: 'badge-purple',
        defaultInSeed: true,
        labelTemplate: '{type}\n(k={kernel_size}, s={stride})',
        fields: [
            { key: 'kernel_size', label: 'kernel_size', type: 'number', default: 2, min: 1 },
            { key: 'stride', label: 'stride', type: 'number', default: 2, min: 1 },
            { key: 'padding', label: 'padding', type: 'number', default: 0, min: 0 }
        ]
    },
    {
        type: 'nn.Dropout',
        name: 'nn.Dropout',
        category: 'regularization',
        badge: 'reg',
        badgeClass: 'badge-red',
        defaultInSeed: true,
        labelTemplate: '{type}\n(p={p})',
        fields: [
            { key: 'p', label: 'p (drop rate)', type: 'number', default: 0.5, step: 0.05, min: 0, max: 1 }
        ]
    },
    {
        type: 'nn.BatchNorm2d',
        name: 'nn.BatchNorm2d',
        category: 'normalization',
        badge: 'norm',
        badgeClass: 'badge-blue',
        defaultInSeed: true,
        labelTemplate: '{type}\n({num_features})',
        fields: [
            { key: 'num_features', label: 'num_features', type: 'number', default: 64, min: 1 },
            { key: 'eps', label: 'eps', type: 'number', default: 1e-5, step: 1e-5 }
        ]
    },
    {
        type: 'nn.LayerNorm',
        name: 'nn.LayerNorm',
        category: 'normalization',
        badge: 'norm',
        badgeClass: 'badge-blue',
        defaultInSeed: false,
        labelTemplate: '{type}\n({normalized_shape})',
        fields: [
            { key: 'normalized_shape', label: 'normalized_shape', type: 'number', default: 64, min: 1 },
            { key: 'eps', label: 'eps', type: 'number', default: 1e-5, step: 1e-5 }
        ]
    },
    {
        type: 'nn.LSTM',
        name: 'nn.LSTM',
        category: 'recurrent',
        badge: 'rnn',
        badgeClass: 'badge-green',
        defaultInSeed: true,
        labelTemplate: '{type}\n(in={input_size}, hid={hidden_size})',
        fields: [
            { key: 'input_size', label: 'input_size', type: 'number', default: 64, min: 1 },
            { key: 'hidden_size', label: 'hidden_size', type: 'number', default: 128, min: 1 },
            { key: 'num_layers', label: 'num_layers', type: 'number', default: 1, min: 1 },
            { key: 'batch_first', label: 'batch_first', type: 'boolean', default: true }
        ]
    },
    {
        type: 'nn.Embedding',
        name: 'nn.Embedding',
        category: 'embedding',
        badge: 'emb',
        badgeClass: 'badge-purple',
        defaultInSeed: true,
        labelTemplate: '{type}\n({num_embeddings}, dim={embedding_dim})',
        fields: [
            { key: 'num_embeddings', label: 'num_embeddings', type: 'number', default: 1000, min: 1 },
            { key: 'embedding_dim', label: 'embedding_dim', type: 'number', default: 64, min: 1 }
        ]
    },
    {
        type: 'nn.MultiheadAttention',
        name: 'nn.MultiheadAttention',
        category: 'attention',
        badge: 'attn',
        badgeClass: 'badge-orange',
        defaultInSeed: false,
        labelTemplate: '{type}\n(dim={embed_dim}, heads={num_heads})',
        fields: [
            { key: 'embed_dim', label: 'embed_dim', type: 'number', default: 64, min: 1 },
            { key: 'num_heads', label: 'num_heads', type: 'number', default: 4, min: 1 },
            { key: 'dropout', label: 'dropout', type: 'number', default: 0.0, step: 0.05, min: 0, max: 1 }
        ]
    }
];

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

/**
 * Retrieves the base layer type name from a node.
 */
export function getLayerBaseType(node) {
    if (!node) return 'Custom Node';
    if (node.layerType) return node.layerType;
    const label = node.label || '';
    return label.split('\n')[0].trim() || 'Custom Node';
}

/**
 * Renders a label template string replacing {param} and conditional sections {#param}...{/param}.
 */
export function renderLabelTemplate(template, data) {
    if (!template) return data.type || '';

    // Handle truthy conditional sections: {#key}content{/key}
    let res = template.replace(/\{#(\w+)\}([\s\S]*?)\{\/\1\}/g, (match, key, content) => {
        return Boolean(data[key]) ? content : '';
    });

    // Handle inverted conditional sections: {^key}content{/key}
    res = res.replace(/\{\^(\w+)\}([\s\S]*?)\{\/\1\}/g, (match, key, content) => {
        return !Boolean(data[key]) ? content : '';
    });

    // Handle variable substitutions: {key}
    res = res.replace(/\{(\w+)\}/g, (match, key) => {
        if (data[key] !== undefined && data[key] !== null) {
            return String(data[key]);
        }
        return '';
    });

    return res;
}

/**
 * Computes the multi-line node label string shown on canvas for a layer type and parameter set.
 */
export function formatNodeLabel(layerType, params) {
    if (!params || Object.keys(params).length === 0) {
        return layerType;
    }
    const schema = LAYER_SCHEMAS[layerType];
    if (schema) {
        if (typeof schema.formatLabel === 'function') {
            return schema.formatLabel(params);
        }
        if (schema.labelTemplate) {
            const context = Object.assign({ type: layerType }, getDefaultParams(layerType), params);
            return renderLabelTemplate(schema.labelTemplate, context);
        }
    }
    if (params.customArgs) {
        return `${layerType}\n(${params.customArgs})`;
    }
    return layerType;
}
