import { getNodeDisplayName } from '../schemas.js';

export function tensorSummary(node) {
    const info = node.tensorInfo;
    if (!info) return '';
    if (info.message) return info.message;
    const lines = [];
    if (info.input) lines.push(`Input: [${info.input.join(', ')}]`);
    if (info.output) lines.push(`Output: [${info.output.join(', ')}]`);
    else if (info.outputTree) lines.push(`Outputs: ${JSON.stringify(info.outputTree)}`);
    if (info.auto?.length) lines.push(`Automatic: ${info.auto.map(key => key === 'inputs' ? 'input shapes' : `${key}=${node.params[key]}`).join(', ')}`);
    if (node.adaptedModel) lines.push('Adapted recursively. Save to create the adapted model subfolders.');
    return lines.join('\n');
}

export function integratedShapeLabel(node) {
    const params = node.params || {};
    const lines = [getNodeDisplayName(node), '────────────────────────'];
    for (const [key, caption] of [['inputs', 'IN'], ['outputs', 'OUT']]) {
        for (const port of params[key] || []) {
            const shape = Array.isArray(port.shape) ? port.shape.join(', ') : String(port.shape || '').replace(/[\[\]]/g, '');
            lines.push(`${caption}: ${port.name || port.id || key} [${shape}]`);
        }
    }
    if (node.tensorInfo?.message) lines.push('Shape unresolved');
    else if (node.adaptedModel) lines.push('Adapted · save to create copy');
    return lines.join('\n');
}
