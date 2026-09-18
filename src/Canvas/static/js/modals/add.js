import { state } from '../state.js';
import { LAYER_SCHEMAS, getDefaultParams, formatNodeLabel, getNodeDisplayName } from '../schemas.js';
import { api } from '../api.js';
import { createBlock } from '../graph.js';
import { populateCategoryDropdown, populateNodeTypeDropdown, updateNodePreview } from './categories.js';
let addNodeListenersInitialized = false;

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
    state.tempNodeData = nodeData;

    setupAddNodeModalListeners();

    const searchInput = document.getElementById('nodeSearchInput');
    const catSelect = document.getElementById('nodeCategory');
    if (searchInput) searchInput.value = '';
    if (catSelect) catSelect.value = 'all';

    populateCategoryDropdown();
    populateNodeTypeDropdown('all', '');

    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('nodeModal');
    const customInput = document.getElementById('customNodeName');

    if (overlay) overlay.style.display = 'block';
    if (modal) modal.style.display = 'block';
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
    state.tempNodeData = null;

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
            const newNode = await api.addNode(baseType, baseType, posX, posY, defaultParams);
            const displayName = getNodeDisplayName(newNode);
            const nodeObj = {
                tensorInfo: newNode.tensorInfo,
                id: String(newNode.id),
                label: displayName,
                title: displayName,
                layerType: baseType,
                params: defaultParams,
                shape: 'box',
                x: (typeof newNode.x === 'number' && !isNaN(newNode.x)) ? newNode.x : posX,
                y: (typeof newNode.y === 'number' && !isNaN(newNode.y)) ? newNode.y : posY
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
    state.tempNodeData = null;
    closeModal();
    if (cb) cb(null);
}

export function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('nodeModal');
    if (overlay) overlay.style.display = 'none';
    if (modal) modal.style.display = 'none';
    state.addNodeCallback = null;
    state.tempNodeData = null;
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
