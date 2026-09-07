// ── Modals: Add Block & Edit Layer Parameters ─────────────────────
import { state } from './state.js';
import { LAYER_SCHEMAS, getDefaultParams, getLayerBaseType, formatNodeLabel } from './schemas.js';
import { esc } from './utils.js';
import { api } from './api.js';
import { createBlock } from './graph.js';
import { hideContextMenu } from './contextMenu.js';
import { closeSelectFolderModal } from './workspace.js';

// ── Add Block Modal ───────────────────────────────────────────────

export function openAddNodeModal(nodeData = null, callback = null) {
    state.addNodeCallback = callback;
    state.tempNodeData    = nodeData;

    const overlay = document.getElementById('modalOverlay');
    const modal   = document.getElementById('nodeModal');
    const select  = document.getElementById('nodeType');
    const customInput = document.getElementById('customNodeName');

    if (overlay) overlay.style.display = 'block';
    if (modal)   modal.style.display   = 'block';
    if (select)  select.value = 'nn.Linear';
    if (customInput) customInput.value = '';

    toggleCustom();
}

export function toggleCustom() {
    const select = document.getElementById('nodeType');
    const customDiv = document.getElementById('customNodeDiv');
    if (customDiv && select) {
        customDiv.style.display = select.value === 'custom' ? 'block' : 'none';
    }
}

export async function saveNode() {
    const select = document.getElementById('nodeType');
    const type = select ? select.value : 'nn.Linear';
    const customInput = document.getElementById('customNodeName');
    const label = type === 'custom'
        ? ((customInput && customInput.value.trim()) || 'Custom Node')
        : type;
    const baseType = type === 'custom' ? label : type;
    const defaultParams = LAYER_SCHEMAS[baseType] ? getDefaultParams(baseType) : {};
    const formattedLabel = formatNodeLabel(baseType, defaultParams);

    // Capture and clear before async gap
    const cb = state.addNodeCallback;
    const td = state.tempNodeData;
    state.addNodeCallback = null;
    state.tempNodeData    = null;

    let posX = 0, posY = 0;
    if (td && typeof td.x === 'number' && !isNaN(td.x)) {
        posX = Math.round(td.x);
        posY = Math.round(td.y);
    } else if (state.network) {
        const v = state.network.getViewPosition();
        posX = Math.round(v.x + (Math.random() * 160 - 80));
        posY = Math.round(v.y + (Math.random() * 160 - 80));
    }

    closeModal();

    if (cb) {
        try {
            const newNode = await api.addNode(formattedLabel, baseType, posX, posY);
            const nodeObj = {
                id:        String(newNode.id),
                label:     formattedLabel,
                layerType: baseType,
                params:    defaultParams,
                shape:     'box',
                x:         (typeof newNode.x === 'number' && !isNaN(newNode.x)) ? newNode.x : posX,
                y:         (typeof newNode.y === 'number' && !isNaN(newNode.y)) ? newNode.y : posY
            };
            cb(nodeObj);
        } catch (err) {
            console.error('Error saving node:', err);
            alert('Error adding block: ' + err.message);
            cb(null);
        }
    } else {
        await createBlock(label, posX, posY);
    }
}

export function cancelNode() {
    const cb = state.addNodeCallback;
    state.addNodeCallback = null;
    state.tempNodeData    = null;
    closeModal();
    if (cb) cb(null);
}

export function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    const modal   = document.getElementById('nodeModal');
    if (overlay) overlay.style.display = 'none';
    if (modal)   modal.style.display   = 'none';
    state.addNodeCallback = null;
    state.tempNodeData    = null;
}

export function openAddNodeAtContext() {
    if (!state.contextClickPos || !state.network) {
        openAddNodeModal();
        return;
    }
    state.tempNodeData = {
        x: Math.round(state.contextClickPos.x),
        y: Math.round(state.contextClickPos.y)
    };
    state.addNodeCallback = null;

    const overlay = document.getElementById('modalOverlay');
    const modal   = document.getElementById('nodeModal');
    const select  = document.getElementById('nodeType');
    const customInput = document.getElementById('customNodeName');

    if (overlay) overlay.style.display = 'block';
    if (modal)   modal.style.display   = 'block';
    if (select)  select.value = 'nn.Linear';
    if (customInput) customInput.value = '';

    toggleCustom();
}

// ── Edit Layer Parameters Modal ───────────────────────────────────

export function openEditNodeModal(nodeId) {
    if (!state.network || !state.nodesDataSet) return;
    const node = state.nodesDataSet.get(nodeId);
    if (!node) return;

    state.editingNodeId = String(nodeId);
    state.editingLayerType = getLayerBaseType(node);

    const badge = document.getElementById('editLayerTypeBadge');
    if (badge) badge.textContent = state.editingLayerType;

    const schema = LAYER_SCHEMAS[state.editingLayerType];
    const params = Object.assign({}, schema ? getDefaultParams(state.editingLayerType) : {}, node.params || {});

    const container = document.getElementById('editParamsContainer');
    if (container) {
        container.innerHTML = '';

        if (schema) {
            schema.fields.forEach(f => {
                const val = params[f.key] !== undefined ? params[f.key] : f.default;
                if (f.type === 'boolean') {
                    const group = document.createElement('div');
                    group.className = 'param-checkbox-group';
                    group.innerHTML = `
                        <input type="checkbox" id="edit_param_${f.key}" ${val ? 'checked' : ''}>
                        <label for="edit_param_${f.key}">${esc(f.label)}</label>
                    `;
                    container.appendChild(group);
                } else {
                    const group = document.createElement('div');
                    group.className = 'param-group';
                    const hint = f.min !== undefined ? `min: ${f.min}` : (f.step ? `step: ${f.step}` : '');
                    group.innerHTML = `
                        <label for="edit_param_${f.key}">
                            <span>${esc(f.label)}</span>
                            ${hint ? `<span class="param-hint">${hint}</span>` : ''}
                        </label>
                        <input type="${f.type || 'number'}" id="edit_param_${f.key}" value="${val}"
                               ${f.step !== undefined ? `step="${f.step}"` : ''}
                               ${f.min !== undefined ? `min="${f.min}"` : ''}
                               ${f.max !== undefined ? `max="${f.max}"` : ''}>
                    `;
                    container.appendChild(group);
                }
            });
        } else {
            // Custom or unlisted layer
            const nameGroup = document.createElement('div');
            nameGroup.className = 'param-group';
            nameGroup.innerHTML = `
                <label for="edit_param_customName">Layer Name</label>
                <input type="text" id="edit_param_customName" value="${esc(state.editingLayerType)}">
            `;
            container.appendChild(nameGroup);

            const argsGroup = document.createElement('div');
            argsGroup.className = 'param-group';
            argsGroup.innerHTML = `
                <label for="edit_param_customArgs">
                    <span>Parameters / Arguments</span>
                    <span class="param-hint">e.g. dim=128, heads=4</span>
                </label>
                <input type="text" id="edit_param_customArgs" value="${esc(params.customArgs || '')}" placeholder="e.g. dim=128, bias=True">
            `;
            container.appendChild(argsGroup);
        }
    }

    const overlay = document.getElementById('modalOverlay');
    const editModal = document.getElementById('editLayerModal');
    if (overlay) overlay.style.display = 'block';
    if (editModal) editModal.style.display = 'block';
}

export function closeEditModal() {
    const modal = document.getElementById('editLayerModal');
    if (modal) modal.style.display = 'none';
    const overlay = document.getElementById('modalOverlay');
    const nodeModal = document.getElementById('nodeModal');
    const folderModal = document.getElementById('selectFolderModal');
    if (overlay && (!nodeModal || nodeModal.style.display !== 'block') && (!folderModal || folderModal.style.display !== 'block')) {
        overlay.style.display = 'none';
    }
    state.editingNodeId = null;
    state.editingLayerType = null;
}

export function closeAllModals() {
    cancelNode();
    closeEditModal();
    closeSelectFolderModal();
}

export async function saveEditNode() {
    if (!state.editingNodeId || !state.nodesDataSet) return;

    let layerType = state.editingLayerType;
    const schema = LAYER_SCHEMAS[layerType];
    const updatedParams = {};

    if (schema) {
        schema.fields.forEach(f => {
            const input = document.getElementById(`edit_param_${f.key}`);
            if (input) {
                if (f.type === 'boolean') {
                    updatedParams[f.key] = input.checked;
                } else if (f.type === 'number') {
                    const parsed = parseFloat(input.value);
                    updatedParams[f.key] = isNaN(parsed) ? f.default : parsed;
                } else {
                    updatedParams[f.key] = input.value;
                }
            }
        });
    } else {
        const nameInput = document.getElementById('edit_param_customName');
        const argsInput = document.getElementById('edit_param_customArgs');
        if (nameInput && nameInput.value.trim()) {
            layerType = nameInput.value.trim();
        }
        if (argsInput) {
            updatedParams.customArgs = argsInput.value.trim();
        }
    }

    const newLabel = formatNodeLabel(layerType, updatedParams);
    const targetNodeId = state.editingNodeId;

    // Update in-memory Vis DataSet
    state.nodesDataSet.update({
        id: targetNodeId,
        label: newLabel,
        layerType: layerType,
        params: updatedParams
    });

    closeEditModal();

    // Persist to server API
    try {
        await api.updateNode({
            id: targetNodeId,
            label: newLabel,
            layerType: layerType,
            params: updatedParams
        });
    } catch (e) {
        console.warn('Failed to persist node parameter updates to backend:', e);
    }
}

export function openEditNodeFromContext() {
    hideContextMenu();
    if (!state.network) return;
    const selected = state.network.getSelectedNodes();
    if (selected && selected.length === 1) {
        openEditNodeModal(selected[0]);
    }
}
