// ── Layer Parameter Schemas & Helpers ────────────────────────────
// Loads module specifications dynamically from /static/data/modules.json
// with an embedded fallback for resilience and offline support.

// Internal default definitions used before or in case JSON fetch fails
export const FALLBACK_MODULES = [
    {
        type: 'torch.add',
        name: 'torch.add',
        category: 'tensor operations',
        badge: 'add',
        badgeClass: 'badge-purple',
        defaultInSeed: true,
        labelTemplate: 'add',
        fields: []
    },
    {
        type: 'torch.cat',
        name: 'torch.cat',
        category: 'tensor operations',
        badge: 'cat',
        badgeClass: 'badge-blue',
        defaultInSeed: true,
        labelTemplate: 'cat (dim={dim})',
        fields: [
            { key: 'dim', label: 'Concatenation Dimension', type: 'number', default: 1, min: 0, max: 4, step: 1 }
        ]
    },
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
