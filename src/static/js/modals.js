// ── Modals: Add Block & Edit Layer Parameters ─────────────────────
import { state } from './state.js';
import { MODULES_LIST, LAYER_SCHEMAS, getDefaultParams, getLayerBaseType, formatNodeLabel, getNodeDisplayName } from './schemas.js';
import { esc } from './utils.js';
import { api } from './api.js';
import { createBlock } from './graph.js';
import { hideContextMenu } from './contextMenu.js';
import { closeSelectFolderModal } from './workspace.js';

// ── Add Block Modal ───────────────────────────────────────────────

export const CATEGORY_DEFINITIONS = [
    { id: 'all', label: 'All Categories', icon: '✨' },
    { id: 'conv', label: 'Convolutional', icon: '🖼️' },
    { id: 'dense', label: 'Dense & Linear', icon: '📦' },
    { id: 'activation', label: 'Non-linear Activations', icon: '⚡' },
    { id: 'pooling', label: 'Pooling Layers', icon: '🏊' },
    { id: 'normalization', label: 'Normalization', icon: '📐' },
    { id: 'padding', label: 'Padding Layers', icon: '🔲' },
    { id: 'regularization', label: 'Dropout & Regularization', icon: '🛡️' },
    { id: 'recurrent', label: 'Recurrent (RNN / LSTM / GRU)', icon: '🔁' },
    { id: 'transformer', label: 'Transformer & Attention', icon: '🤖' },
    { id: 'embedding', label: 'Embeddings', icon: '🔤' },
    { id: 'vision', label: 'Vision & Resizing', icon: '🔍' },
    { id: 'loss', label: 'Loss Functions', icon: '🎯' },
    { id: 'distance', label: 'Distance & Similarity', icon: '📏' },
    { id: 'utility', label: 'Shape Operations', icon: '🔄' },
    { id: 'custom', label: 'Custom Layer...', icon: '⚙️' }
];

let addNodeListenersInitialized = false;

export function populateCategoryDropdown() {
    const select = document.getElementById('nodeCategory');
    if (!select) return;

    // Count modules per category
    const counts = {};
    MODULES_LIST.forEach(m => {
        const cat = m.category || 'other';
        counts[cat] = (counts[cat] || 0) + 1;
    });

    const currentVal = select.value || 'all';
    let html = '';
    CATEGORY_DEFINITIONS.forEach(cat => {
        let countText = '';
        if (cat.id === 'all') {
            countText = ` (${MODULES_LIST.length})`;
        } else if (cat.id !== 'custom' && counts[cat.id]) {
            countText = ` (${counts[cat.id]})`;
        }
        html += `<option value="${esc(cat.id)}">${cat.icon} ${esc(cat.label)}${countText}</option>`;
    });

    select.innerHTML = html;
    if (currentVal && Array.from(select.options).some(opt => opt.value === currentVal)) {
        select.value = currentVal;
    }
}

export function populateNodeTypeDropdown(category = 'all', searchQuery = '') {
    const select = document.getElementById('nodeType');
    if (!select) return;

    const query = searchQuery.trim().toLowerCase();
    let filtered = MODULES_LIST;

    if (category !== 'all' && category !== 'custom') {
        filtered = filtered.filter(m => (m.category || '').toLowerCase() === category.toLowerCase());
    }

    if (query) {
        filtered = filtered.filter(m => {
            const t = (m.type || '').toLowerCase();
            const n = (m.name || '').toLowerCase();
            const c = (m.category || '').toLowerCase();
            const b = (m.badge || '').toLowerCase();
            return t.includes(query) || n.includes(query) || c.includes(query) || b.includes(query);
        });
    }

    let html = '';
    if (category === 'all' && !query) {
        // Group by category with optgroups
        const groups = {};
        filtered.forEach(mod => {
            const catId = mod.category || 'other';
            if (!groups[catId]) groups[catId] = [];
            groups[catId].push(mod);
        });

        CATEGORY_DEFINITIONS.forEach(cat => {
            if (cat.id === 'all' || cat.id === 'custom') return;
            const items = groups[cat.id];
            if (items && items.length > 0) {
                html += `<optgroup label="${cat.icon} ${esc(cat.label)}">`;
                items.forEach(mod => {
                    html += `<option value="${esc(mod.type)}">${esc(mod.type)}</option>`;
                });
                html += `</optgroup>`;
            }
        });
    } else {
        filtered.forEach(mod => {
            html += `<option value="${esc(mod.type)}">${esc(mod.type)}</option>`;
        });
    }

    html += `<option value="custom">⚙️ Custom Layer...</option>`;
    select.innerHTML = html;

    if (category === 'custom') {
        select.value = 'custom';
    } else if (filtered.length > 0) {
        select.value = filtered[0].type;
    } else {
        select.value = 'custom';
    }

    toggleCustom();
    updateNodePreview();
}

export function updateNodePreview() {
    const select = document.getElementById('nodeType');
    const badgeEl = document.getElementById('nodePreviewBadge');
    const catEl = document.getElementById('nodePreviewCategory');
    const labelEl = document.getElementById('nodePreviewLabel');
    const codeEl = document.getElementById('nodePreviewCode');
    const card = document.getElementById('nodePreviewCard');
    if (!select || !card) return;

    const chosenType = select.value;
    if (chosenType === 'custom') {
        if (badgeEl) {
            badgeEl.className = 'palette-badge badge-gray';
            badgeEl.textContent = 'custom';
        }
        if (catEl) catEl.textContent = 'Custom Block';
        if (labelEl) labelEl.textContent = 'Custom Layer (User-defined)';
        if (codeEl) codeEl.textContent = 'CustomModule(...)';
        return;
    }

    const schema = LAYER_SCHEMAS[chosenType];
    if (!schema) {
        if (badgeEl) {
            badgeEl.className = 'palette-badge badge-blue';
            badgeEl.textContent = 'layer';
        }
        if (catEl) catEl.textContent = 'Neural Block';
        if (labelEl) labelEl.textContent = chosenType;
        if (codeEl) codeEl.textContent = `${chosenType}()`;
        return;
    }

    if (badgeEl) {
        badgeEl.className = `palette-badge ${schema.badgeClass || 'badge-blue'}`;
        badgeEl.textContent = schema.badge || 'layer';
    }
    if (catEl) {
        const def = CATEGORY_DEFINITIONS.find(c => c.id === schema.category);
        catEl.textContent = def ? `${def.icon} ${def.label}` : (schema.category || 'Layer');
    }
    if (labelEl) {
        const sampleLabel = formatNodeLabel(chosenType, getDefaultParams(chosenType));
        labelEl.textContent = sampleLabel;
    }
    if (codeEl) {
        codeEl.textContent = schema.code || `${chosenType}()`;
    }
}

export function setupAddNodeModalListeners() {
    if (addNodeListenersInitialized) return;
    addNodeListenersInitialized = true;

    const categorySelect = document.getElementById('nodeCategory');
    const typeSelect = document.getElementById('nodeType');
    const searchInput = document.getElementById('nodeSearchInput');
    const customInput = document.getElementById('customNodeName');

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            const cat = e.target.value;
            const query = searchInput ? searchInput.value : '';
            populateNodeTypeDropdown(cat, query);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            const cat = categorySelect ? categorySelect.value : 'all';
            populateNodeTypeDropdown(cat, query);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveNode();
            }
        });
    }

    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            toggleCustom();
            updateNodePreview();
        });
    }

    if (customInput) {
        customInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveNode();
            }
        });
    }
}

export function openAddNodeModal(nodeData = null, callback = null) {
    state.addNodeCallback = callback;
    state.tempNodeData    = nodeData;

    setupAddNodeModalListeners();

    const searchInput = document.getElementById('nodeSearchInput');
    const catSelect = document.getElementById('nodeCategory');
    if (searchInput) searchInput.value = '';
    if (catSelect) catSelect.value = 'all';

    populateCategoryDropdown();
    populateNodeTypeDropdown('all', '');

    const overlay = document.getElementById('modalOverlay');
    const modal   = document.getElementById('nodeModal');
    const customInput = document.getElementById('customNodeName');

    if (overlay) overlay.style.display = 'block';
    if (modal)   modal.style.display   = 'block';
    if (customInput) customInput.value = '';

    toggleCustom();
    updateNodePreview();

    // Focus search input for quick keyboard typing
    setTimeout(() => {
        if (searchInput) searchInput.focus();
    }, 50);
}

export function toggleCustom() {
    const select = document.getElementById('nodeType');
    const customDiv = document.getElementById('customNodeDiv');
    if (customDiv && select) {
        const isCustom = select.value === 'custom';
        customDiv.style.display = isCustom ? 'block' : 'none';
        if (isCustom) {
            const customInput = document.getElementById('customNodeName');
            if (customInput) customInput.focus();
        }
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
            const newNode = await api.addNode(baseType, baseType, posX, posY);
            const displayName = getNodeDisplayName(newNode);
            const nodeObj = {
                id:        String(newNode.id),
                label:     displayName,
                title:     displayName,
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
    openAddNodeModal({
        x: Math.round(state.contextClickPos.x),
        y: Math.round(state.contextClickPos.y)
    });
}

// ── Edit Layer Parameters Modal ───────────────────────────────────

export function openEditNodeModal(nodeId) {
    if (!state.network || !state.nodesDataSet) return;
    const node = state.nodesDataSet.get(nodeId);
    if (!node) return;

    state.editingNodeId = String(nodeId);
    state.editingLayerType = getLayerBaseType(node);

    const badge = document.getElementById('editLayerTypeBadge');
    if (badge) {
        const displayName = String(nodeId).replace('_', ' ');
        badge.textContent = `${state.editingLayerType} (${displayName})`;
    }

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

    const targetNodeId = state.editingNodeId;
    const displayName = getNodeDisplayName({ id: targetNodeId, layerType: layerType });

    // Update in-memory Vis DataSet
    state.nodesDataSet.update({
        id: targetNodeId,
        label: displayName,
        title: displayName,
        layerType: layerType,
        params: updatedParams
    });

    closeEditModal();

    // Persist to server API
    try {
        await api.updateNode({
            id: targetNodeId,
            label: displayName,
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
