import { LAYER_SCHEMAS, getDefaultParams, getNodeDisplayName } from '../schemas.js';
import { tensorSummary, integratedShapeLabel } from '../api.js';
import { computeEdgeLines } from '../circuit.js';

export function prepareNodes(data) {
    return (data.nodes || []).map(n => {
            const baseType = n.layerType || (n.label || '').split('\n')[0].trim();
            const params = n.params || (LAYER_SCHEMAS[baseType] ? getDefaultParams(baseType) : {});
            const isIntegrated = (baseType === 'IntegratedModel' || Boolean(params && params.model_path));
            let displayName = getNodeDisplayName(n);
            let label = displayName;
            let nodeVisuals = { shape: n.shape || 'box' };

            // ponytail: IC representation for integrated model blocks
            if (isIntegrated) {
                const modelName = (params && params.model_name) || n.label || 'Integrated Model';
                const instId = String(n.id || '').includes('_') ? String(n.id).split('_').pop() : '';
                label = integratedShapeLabel(n);
                displayName = `IC: ${modelName}${instId !== '' ? ' #' + instId : ''}`;
                nodeVisuals = {
                    shape: 'box',
                    font: { face: 'monospace', size: 12, color: '#f8fafc', align: 'left' },
                    color: {
                        background: '#0f172a',
                        border: '#38bdf8',
                        highlight: { background: '#1e293b', border: '#7dd3fc' }
                    },
                    borderWidth: 2,
                    shadow: { enabled: true, color: 'rgba(56, 189, 248, 0.25)', size: 8, x: 0, y: 0 }
                };
            }

            return {
                ...n,
                ...nodeVisuals,
                id: String(n.id),
                label: label,
                title: isIntegrated ? `Integrated Model: ${(params && params.model_name) || 'Submodel'}\nPath: ${(params && params.model_path) || ''}` : displayName,
                layerType: baseType,
                params: params,
                title: `${displayName}\n${tensorSummary(n)}`
            };
        });
}

export function prepareEdges(data, processedNodes) {
    const nodesById = new Map(processedNodes.map(node => [String(node.id), node]));
    return (data.edges || []).map((e, idx) => {
            let lines = e.lines;
            const foldMode = e.foldMode || 'horizontal';
            const customFold = (e.customFold !== undefined && e.customFold !== null) ? e.customFold : null;
            if (!lines || lines.length === 0) {
                const fn = nodesById.get(String(e.from));
                const tn = nodesById.get(String(e.to));
                if (fn && tn) {
                    lines = computeEdgeLines({ x: fn.x, y: fn.y }, { x: tn.x, y: tn.y }, foldMode, customFold);
                }
            }
            return {
                ...e,
                id: String(e.id),
                from: String(e.from),
                to: String(e.to),
                index: e.index !== undefined ? e.index : idx,
                lines: lines || [],
                foldMode: foldMode,
                customFold: customFold,
                color: {
                    color: 'rgba(0,0,0,0)',
                    highlight: 'rgba(0,0,0,0)',
                    hover: 'rgba(0,0,0,0)',
                    inherit: false,
                    opacity: 0
                },
                width: 10
            };
        });
}
