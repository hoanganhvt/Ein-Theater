import { state } from '../state.js';
import { api } from '../api.js';
import { runtime } from './runtime.js';
import { computeEdgeLines } from './geometry.js';
import { updateEdgeIndices } from './edges.js';
import { updateEdgeUISelection, getActiveEdgeId } from './selection.js';
// ── Edit Edge Modal Operations ───────────────────────────────────

export function openEditEdgeModal(targetEdgeId = null) {
    if (!state.network || !state.edgesDataSet) return;

    try {
        let edgeId = targetEdgeId;
        if (!edgeId) {
            edgeId = getActiveEdgeId();
        }
        if (!edgeId) return;

        const edge = state.edgesDataSet.get(edgeId) ||
                     state.edgesDataSet.get(String(edgeId)) ||
                     (state.edgesDataSet.get().find(e => String(e.id) === String(edgeId)));
        if (!edge) return;

        runtime.currentEditingEdgeId = String(edge.id || edgeId);

        const fromNode = state.nodesDataSet ? (state.nodesDataSet.get(String(edge.from)) || state.nodesDataSet.get(edge.from)) : null;
        const toNode = state.nodesDataSet ? (state.nodesDataSet.get(String(edge.to)) || state.nodesDataSet.get(edge.to)) : null;
        const fromLabel = fromNode ? (fromNode.label || edge.from) : edge.from;
        const toLabel = toNode ? (toNode.label || edge.to) : edge.to;

        const fromEl = document.getElementById('editEdgeFromLabel');
        const toEl = document.getElementById('editEdgeToLabel');
        if (fromEl) fromEl.textContent = fromLabel;
        if (toEl) toEl.textContent = toLabel;

        const foldSelect = document.getElementById('editEdgeFoldSelect');
        if (foldSelect) {
            foldSelect.value = edge.foldMode || 'horizontal';
        }

        const modal = document.getElementById('editEdgeModal');
        const overlay = document.getElementById('modalOverlay');
        if (modal) {
            modal.style.display = 'block';
            if (overlay) overlay.style.display = 'block';
        } else {
            console.error('editEdgeModal dialog element was not found in the DOM.');
        }
    } catch (err) {
        console.error('Error opening edit edge modal:', err);
    }
}

export function closeEditEdgeModal() {
    const modal = document.getElementById('editEdgeModal');
    const overlay = document.getElementById('modalOverlay');
    if (modal) modal.style.display = 'none';

    const nodeModal = document.getElementById('nodeModal');
    const editLayerModal = document.getElementById('editLayerModal');
    const folderModal = document.getElementById('selectFolderModal');
    const otherModalOpen = (nodeModal && nodeModal.style.display === 'block') ||
                           (editLayerModal && editLayerModal.style.display === 'block') ||
                           (folderModal && folderModal.style.display === 'block');
    if (overlay && !otherModalOpen) {
        overlay.style.display = 'none';
    }
    runtime.currentEditingEdgeId = null;
}

export async function saveEditEdgeModal() {
    if (!runtime.currentEditingEdgeId) {
        closeEditEdgeModal();
        return;
    }
    const edgeId = runtime.currentEditingEdgeId;
    const foldSelect = document.getElementById('editEdgeFoldSelect');
    const newFoldMode = foldSelect ? foldSelect.value : 'horizontal';

    try {
        const edge = state.edgesDataSet.get(edgeId);
        if (edge) {
            edge.foldMode = newFoldMode;
            const fromPos = state.network.getPositions([String(edge.from)])[String(edge.from)];
            const toPos = state.network.getPositions([String(edge.to)])[String(edge.to)];
            if (fromPos && toPos) {
                edge.lines = computeEdgeLines(fromPos, toPos, newFoldMode, edge.customFold);
            }
            state.edgesDataSet.update(edge);
            await api.updateEdge(edgeId, edge.lines, 'normal', newFoldMode, edge.customFold);
        }

        closeEditEdgeModal();
        updateEdgeUISelection();
        if (state.network) state.network.redraw();
    } catch (err) {
        console.error('Failed to save edge:', err);
        if (typeof window.showToast === 'function') {
            window.showToast('Failed to save connection: ' + err.message);
        }
    }
}

export async function deleteEdgeFromModal() {
    if (!runtime.currentEditingEdgeId) return;
    const edgeId = runtime.currentEditingEdgeId;
    closeEditEdgeModal();
    await deleteEdgeById(edgeId);
}

export async function deleteSelectedEdge() {
    const edgeId = getActiveEdgeId();
    if (edgeId) {
        runtime.lastSelectedEdgeId = null; // Clear after delete
        await deleteEdgeById(edgeId);
    }
}

export const deleteSelectedEdgeFromBar = deleteSelectedEdge;

export async function deleteEdgeById(edgeId) {
    if (!edgeId || !state.edgesDataSet) return;
    try {
        await api.deleteEdge(edgeId);
        state.edgesDataSet.remove(edgeId);
        updateEdgeIndices();
        updateEdgeUISelection();
        if (state.network) state.network.redraw();
        if (typeof window.showToast === 'function') {
            window.showToast('Connection deleted');
        }
    } catch (err) {
        console.error('Failed to delete edge:', err);
    }
}
