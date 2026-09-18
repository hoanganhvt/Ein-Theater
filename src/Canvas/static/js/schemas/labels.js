/**
 * Retrieves the base layer type name from a node.
 */
export function getLayerBaseType(node) {
    if (!node) return 'Custom Node';
    if (node.layerType) return node.layerType;
    const label = typeof node.label === 'string' ? node.label : '';
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
 * Resolves the clean human-readable name of a node (e.g. "linear 0", "conv 0", "relu 0").
 * Guarantees that the name is displayed, never raw IDs or parameter numbers.
 */
export function getNodeDisplayName(nodeOrType, id = null) {
    let baseType = '';
    let idStr = '';

    if (typeof nodeOrType === 'object' && nodeOrType !== null) {
        // ponytail: integrated model displays IC chip identifier with instance number
        if (nodeOrType.layerType === 'IntegratedModel' || (nodeOrType.params && nodeOrType.params.model_path)) {
            const mName = (nodeOrType.params && nodeOrType.params.model_name) ? nodeOrType.params.model_name : 'Integrated Model';
            const instId = nodeOrType.id && String(nodeOrType.id).includes('_') ? String(nodeOrType.id).split('_').pop() : '';
            return instId ? `IC: ${mName} #${instId}` : `IC: ${mName}`;
        }
        idStr = String(nodeOrType.id || '').trim();
        const labelStr = typeof nodeOrType.label === 'string' ? nodeOrType.label : '';
        baseType = nodeOrType.layerType || labelStr.split('\n')[0].trim() || 'Block';
    } else {
        baseType = String(nodeOrType || 'Block');
        idStr = id !== null ? String(id).trim() : '';
    }

    let cleanType = baseType.replace(/^nn\./, '').replace(/^torch\./, '').toLowerCase();
    if (cleanType === 'conv2d') cleanType = 'conv';
    else if (cleanType === 'batchnorm2d') cleanType = 'batchnorm';
    else if (cleanType === 'maxpool2d') cleanType = 'maxpool';

    if (idStr.includes('_')) {
        return idStr.replace(/_/g, ' ');
    }
    if (/^\d+$/.test(idStr)) {
        return `${cleanType} ${idStr}`;
    }
    if (idStr && idStr !== 'undefined' && idStr !== 'null') {
        return idStr.replace(/_/g, ' ');
    }
    return cleanType;
}

/**
 * Computes the node label shown on canvas for a layer type.
 * Always displays the clean module name (e.g. 'linear 0', 'conv 0'), not parameter numbers.
 */
export function formatNodeLabel(layerTypeOrNode, params = null, displayName = null) {
    if (typeof displayName === 'string' && displayName.trim()) {
        return displayName.trim();
    }
    if (typeof layerTypeOrNode === 'object' && layerTypeOrNode !== null) {
        return getNodeDisplayName(layerTypeOrNode);
    }
    if (typeof params === 'string' && params.trim()) {
        return getNodeDisplayName({ id: layerTypeOrNode, layerType: params });
    }
    return getNodeDisplayName(layerTypeOrNode);
}
