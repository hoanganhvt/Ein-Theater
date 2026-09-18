import { state } from '../state.js';
import { api } from '../api.js';
import { snapToGrid } from '../circuit.js';
/**
 * Formats an electronic IC chip representation showing inputs, input shapes, outputs, and output shapes.
 */
export function formatICLabel(modelName, inputs = [], outputs = [], instanceId = null) {
    // ponytail: electronic IC block representation with pin/shape notes
    const name = modelName || 'IntegratedModel';
    const header = (instanceId !== null && instanceId !== undefined && instanceId !== '')
        ? `⚡ [IC] ${name} #${instanceId}`
        : `⚡ [IC] ${name}`;
    const lines = [header];
    lines.push('────────────────────────');

    const fmtShape = (s) => {
        if (!s) return '';
        if (Array.isArray(s)) return `[${s.join(', ')}]`;
        return `[${String(s).replace(/[\[\]]/g, '')}]`;
    };

    if (inputs && inputs.length > 0) {
        inputs.forEach(inp => {
            const sh = fmtShape(inp.shape);
            const portName = inp.name || inp.id || 'in';
            lines.push(`▶ IN:  ${portName} ${sh}`.trimEnd());
        });
    } else {
        lines.push('▶ IN:  (none)');
    }

    lines.push('────────────────────────');

    if (outputs && outputs.length > 0) {
        outputs.forEach(out => {
            const sh = fmtShape(out.shape);
            const portName = out.name || out.id || 'out';
            lines.push(`◀ OUT: ${portName} ${sh}`.trimEnd());
        });
    } else {
        lines.push('◀ OUT: (none)');
    }

    return lines.join('\n');
}

/**
 * Creates an IntegratedModel IC block on canvas from inspected model metadata.
 */
export async function createIntegratedBlock(inspectData, posX, posY) {
    // ponytail: integrated IC block creation
    try {
        const { x: snappedX, y: snappedY } = snapToGrid(posX, posY);
        const params = {
            model_name: inspectData.modelName || 'IntegratedModel',
            model_path: inspectData.folderPath || '',
            inputs: inspectData.inputs || [],
            outputs: inspectData.outputs || [],
            weights_path: '',
            freeze_weights: false
        };
        const tempLabel = formatICLabel(params.model_name, params.inputs, params.outputs);
        const newNode = await api.addNode(tempLabel, 'IntegratedModel', snappedX, snappedY, params);

        const instId = String(newNode.id || '').includes('_') ? String(newNode.id).split('_').pop() : '';
        const label = formatICLabel(params.model_name, params.inputs, params.outputs, instId);

        const nodeObj = {
            id: String(newNode.id),
            label: label,
            tensorInfo: newNode.tensorInfo,
            adaptedModel: newNode.adaptedModel || null,
            title: `Integrated Model: ${params.model_name}${instId !== '' ? ' (#' + instId + ')' : ''}\nPath: ${params.model_path}`,
            layerType: 'IntegratedModel',
            params: params,
            shape: 'box',
            font: { face: 'monospace', size: 12, color: '#f8fafc', align: 'left' },
            color: {
                background: '#1b2027',
                border: '#66788f',
                highlight: { background: '#1e293b', border: '#aabbd8' }
            },
            borderWidth: 2,
            shadow: { enabled: false },
            x: (typeof newNode.x === 'number' && !isNaN(newNode.x)) ? newNode.x : snappedX,
            y: (typeof newNode.y === 'number' && !isNaN(newNode.y)) ? newNode.y : snappedY
        };

        if (state.nodesDataSet) {
            state.nodesDataSet.update(nodeObj);
        }
        return nodeObj;
    } catch (err) {
        console.error('Error adding integrated model block:', err);
        alert('Error adding integrated model block: ' + err.message);
    }
}
