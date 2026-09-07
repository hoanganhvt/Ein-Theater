// ── Layer Parameter Schemas & Helpers ────────────────────────────

export const LAYER_SCHEMAS = {
    'nn.Linear': {
        fields: [
            { key: 'in_features', label: 'in_features', type: 'number', default: 128, min: 1 },
            { key: 'out_features', label: 'out_features', type: 'number', default: 64, min: 1 },
            { key: 'bias', label: 'bias', type: 'boolean', default: true }
        ],
        formatLabel: (p) => `nn.Linear\n(${p.in_features || 128} → ${p.out_features || 64})`
    },
    'nn.Conv2d': {
        fields: [
            { key: 'in_channels', label: 'in_channels', type: 'number', default: 3, min: 1 },
            { key: 'out_channels', label: 'out_channels', type: 'number', default: 64, min: 1 },
            { key: 'kernel_size', label: 'kernel_size', type: 'number', default: 3, min: 1 },
            { key: 'stride', label: 'stride', type: 'number', default: 1, min: 1 },
            { key: 'padding', label: 'padding', type: 'number', default: 1, min: 0 },
            { key: 'bias', label: 'bias', type: 'boolean', default: true }
        ],
        formatLabel: (p) => `nn.Conv2d\n(${p.in_channels || 3}→${p.out_channels || 64}, k=${p.kernel_size || 3})`
    },
    'nn.ReLU': {
        fields: [
            { key: 'inplace', label: 'inplace', type: 'boolean', default: false }
        ],
        formatLabel: (p) => p.inplace ? 'nn.ReLU\n(inplace)' : 'nn.ReLU'
    },
    'nn.MaxPool2d': {
        fields: [
            { key: 'kernel_size', label: 'kernel_size', type: 'number', default: 2, min: 1 },
            { key: 'stride', label: 'stride', type: 'number', default: 2, min: 1 },
            { key: 'padding', label: 'padding', type: 'number', default: 0, min: 0 }
        ],
        formatLabel: (p) => `nn.MaxPool2d\n(k=${p.kernel_size || 2}, s=${p.stride || 2})`
    },
    'nn.Dropout': {
        fields: [
            { key: 'p', label: 'p (drop rate)', type: 'number', default: 0.5, step: 0.05, min: 0, max: 1 }
        ],
        formatLabel: (p) => `nn.Dropout\n(p=${p.p !== undefined ? p.p : 0.5})`
    },
    'nn.BatchNorm2d': {
        fields: [
            { key: 'num_features', label: 'num_features', type: 'number', default: 64, min: 1 },
            { key: 'eps', label: 'eps', type: 'number', default: 1e-5, step: 1e-5 }
        ],
        formatLabel: (p) => `nn.BatchNorm2d\n(${p.num_features || 64})`
    },
    'nn.LayerNorm': {
        fields: [
            { key: 'normalized_shape', label: 'normalized_shape', type: 'number', default: 64, min: 1 },
            { key: 'eps', label: 'eps', type: 'number', default: 1e-5, step: 1e-5 }
        ],
        formatLabel: (p) => `nn.LayerNorm\n(${p.normalized_shape || 64})`
    },
    'nn.LSTM': {
        fields: [
            { key: 'input_size', label: 'input_size', type: 'number', default: 64, min: 1 },
            { key: 'hidden_size', label: 'hidden_size', type: 'number', default: 128, min: 1 },
            { key: 'num_layers', label: 'num_layers', type: 'number', default: 1, min: 1 },
            { key: 'batch_first', label: 'batch_first', type: 'boolean', default: true }
        ],
        formatLabel: (p) => `nn.LSTM\n(in=${p.input_size || 64}, hid=${p.hidden_size || 128})`
    },
    'nn.Embedding': {
        fields: [
            { key: 'num_embeddings', label: 'num_embeddings', type: 'number', default: 1000, min: 1 },
            { key: 'embedding_dim', label: 'embedding_dim', type: 'number', default: 64, min: 1 }
        ],
        formatLabel: (p) => `nn.Embedding\n(${p.num_embeddings || 1000}, dim=${p.embedding_dim || 64})`
    },
    'nn.MultiheadAttention': {
        fields: [
            { key: 'embed_dim', label: 'embed_dim', type: 'number', default: 64, min: 1 },
            { key: 'num_heads', label: 'num_heads', type: 'number', default: 4, min: 1 },
            { key: 'dropout', label: 'dropout', type: 'number', default: 0.0, step: 0.05, min: 0, max: 1 }
        ],
        formatLabel: (p) => `nn.MultiheadAttention\n(dim=${p.embed_dim || 64}, heads=${p.num_heads || 4})`
    }
};

export function getDefaultParams(layerType) {
    const schema = LAYER_SCHEMAS[layerType];
    if (!schema) return {};
    const res = {};
    schema.fields.forEach(f => { res[f.key] = f.default; });
    return res;
}

export function getLayerBaseType(node) {
    if (!node) return 'Custom Node';
    if (node.layerType) return node.layerType;
    const label = node.label || '';
    return label.split('\n')[0].trim() || 'Custom Node';
}

export function formatNodeLabel(layerType, params) {
    if (!params || Object.keys(params).length === 0) {
        return layerType;
    }
    const schema = LAYER_SCHEMAS[layerType];
    if (schema && typeof schema.formatLabel === 'function') {
        return schema.formatLabel(params);
    }
    if (params.customArgs) {
        return `${layerType}\n(${params.customArgs})`;
    }
    return layerType;
}
