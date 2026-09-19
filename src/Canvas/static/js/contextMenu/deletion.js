import { state } from '../state.js';
import { api } from '../api.js';
import { updateClipboardUI } from '../clipboard.js';
import { hideContextMenu } from './menu.js';
export async function deleteSelectionFromContextMenu() {
    hideContextMenu();
    if (!state.network) return;

    const selectedNodes = (state.network.getSelectedNodes() || []).map(String);
    let selectedEdges = (state.network.getSelectedEdges() || []).map(String);

    if (selectedEdges.length === 0 && state.contextClickedEdge) {
        selectedEdges = [String(state.contextClickedEdge)];
    }
    state.contextClickedEdge = null;

    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    try {
        await api.deleteSelection(selectedNodes, selectedEdges, state.currentProjectId);
        const nodeSet = new Set(selectedNodes);
        const incident = state.edgesDataSet ? state.edgesDataSet.get().filter(e => nodeSet.has(String(e.from)) || nodeSet.has(String(e.to))).map(e => e.id) : [];
        if (state.edgesDataSet) state.edgesDataSet.remove([...new Set([...selectedEdges, ...incident])]);
        if (state.nodesDataSet) state.nodesDataSet.remove(selectedNodes);
    } catch (err) {
        console.error('Failed to delete selection:', err);
        throw err;
    }

    if (state.network) {
        state.network.unselectAll();
        state.network.redraw();
    }
    updateClipboardUI();
}
