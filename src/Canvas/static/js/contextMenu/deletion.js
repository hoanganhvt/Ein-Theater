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

    // Delete selected nodes via batch API and clean up connected edges in frontend
    if (selectedNodes.length > 0) {
        try {
            await api.deleteNodes(selectedNodes);
            if (state.edgesDataSet) {
                const nodeSet = new Set(selectedNodes);
                const connectedEdges = state.edgesDataSet.get().filter(
                    e => nodeSet.has(String(e.from)) || nodeSet.has(String(e.to))
                );
                if (connectedEdges.length > 0) {
                    state.edgesDataSet.remove(connectedEdges.map(e => e.id));
                }
            }
            if (state.nodesDataSet) {
                state.nodesDataSet.remove(selectedNodes);
            }
        } catch (err) {
            console.error('Failed to batch delete nodes:', err);
        }
    }

    // Delete selected edges if any
    if (selectedEdges.length > 0) {
        for (const edgeId of selectedEdges) {
            try {
                await api.deleteEdge(edgeId);
            } catch (err) {
                console.error(`Failed to delete edge ${edgeId}:`, err);
            }
        }
        if (state.edgesDataSet) {
            state.edgesDataSet.remove(selectedEdges);
        }
    }

    if (state.network) {
        state.network.unselectAll();
        state.network.redraw();
    }
    updateClipboardUI();
}
