import { state } from '../state.js';
import { LAYER_SCHEMAS, getNodeDisplayName } from '../schemas.js';
import { api } from '../api.js';
import { formatICLabel } from '../graph.js';
import { closeEditModal } from './edit.js';
export async function saveEditNode() {
    if (!state.editingNodeId || !state.nodesDataSet) return;

    const node = state.nodesDataSet.get(state.editingNodeId);
    if (!node) return;

    let layerType = state.editingLayerType || node.layerType || 'Block';
    const isIntegrated = (layerType === 'IntegratedModel' || Boolean(node.params && node.params.model_path));

    if (isIntegrated) {
        // ponytail: save integrated model weights path and freeze flag
        const weightsEl = document.getElementById('edit_param_weights_path');
        const freezeEl = document.getElementById('edit_param_freeze_weights');
        const updatedParams = {
            ...(node.params || {}),
            weights_path: weightsEl ? weightsEl.value.trim() : (node.params?.weights_path || ''),
            freeze_weights: freezeEl ? freezeEl.checked : Boolean(node.params?.freeze_weights)
        };
        const instId = String(node.id || '').includes('_') ? String(node.id).split('_').pop() : '';
        const icLabel = formatICLabel(updatedParams.model_name, updatedParams.inputs, updatedParams.outputs, instId);
        const updatedNode = Object.assign({}, node, {
            layerType: 'IntegratedModel',
            params: updatedParams,
            label: icLabel,
            title: `Integrated Model: ${updatedParams.model_name || 'Submodel'}${instId !== '' ? ' (#' + instId + ')' : ''}\nPath: ${updatedParams.model_path || ''}`
        });

        state.nodesDataSet.update(updatedNode);
        closeEditModal();

        try {
            await api.updateNode({
                id: String(node.id),
                params: updatedParams,
                label: icLabel,
                layerType: 'IntegratedModel'
            });
        } catch (e) {
            console.warn('Failed to persist node parameter updates to backend:', e);
        }
        return;
    }

    const schema = LAYER_SCHEMAS[layerType];
    const updatedParams = {};

    if (schema) {
        schema.fields.forEach(f => {
            const el = document.getElementById(`edit_param_${f.key}`);
            if (!el) return;

            if (f.type === 'boolean') {
                updatedParams[f.key] = el.checked;
            } else if (f.type === 'select') {
                updatedParams[f.key] = el.value;
            } else if (f.type === 'text') {
                updatedParams[f.key] = el.value;
            } else {
                const num = parseFloat(el.value);
                updatedParams[f.key] = isNaN(num) ? (f.default !== undefined ? f.default : 0) : num;
            }
        });

        // For Input block: if shape_preset is 'custom', read custom_shape string; else preset value
        if (layerType === 'Input') {
            const presetSelect = document.getElementById('edit_param_shape_preset');
            const customShapeInput = document.getElementById('edit_param_custom_shape');
            if (presetSelect && presetSelect.value === 'custom' && customShapeInput && customShapeInput.value.trim()) {
                updatedParams['shape'] = customShapeInput.value.trim();
            } else if (presetSelect && presetSelect.value !== 'custom') {
                updatedParams['shape'] = presetSelect.value;
            }
        }
    } else {
        const customNameEl = document.getElementById('edit_param_customName');
        if (customNameEl && customNameEl.value.trim()) {
            layerType = customNameEl.value.trim();
        }
        const customArgsEl = document.getElementById('edit_param_customArgs');
        if (customArgsEl) {
            updatedParams.customArgs = customArgsEl.value.trim();
        }
    }

    const displayName = getNodeDisplayName({ id: node.id, layerType: layerType, label: node.label });
    const updatedNode = Object.assign({}, node, {
        layerType: layerType,
        params: updatedParams,
        label: displayName,
        title: displayName
    });

    state.nodesDataSet.update(updatedNode);
    closeEditModal();

    try {
        await api.updateNode({
            id: String(node.id),
            params: updatedParams,
            label: displayName,
            layerType: layerType
        });
    } catch (e) {
        console.warn('Failed to persist node parameter updates to backend:', e);
    }
}
