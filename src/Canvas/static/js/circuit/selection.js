import { state } from '../state.js';
import { runtime } from './runtime.js';
/**
 * Synchronizes the Top Header Edge Toolbar whenever an edge is selected or deselected.
 */
export function updateEdgeUISelection() {
    if (!state.network || !state.edgesDataSet) return;

    const selectedEdges = state.network.getSelectedEdges();
    const hdrToolbar = document.getElementById('headerEdgeToolbar');

    if (!selectedEdges || selectedEdges.length !== 1) {
        if (hdrToolbar) hdrToolbar.style.display = 'none';
        return;
    }

    const edgeId = String(selectedEdges[0]);
    const edge = state.edgesDataSet.get(edgeId);
    if (!edge) {
        if (hdrToolbar) hdrToolbar.style.display = 'none';
        return;
    }

    runtime.lastSelectedEdgeId = edgeId;

    const fromNode = state.nodesDataSet ? state.nodesDataSet.get(String(edge.from)) : null;
    const toNode = state.nodesDataSet ? state.nodesDataSet.get(String(edge.to)) : null;
    const fromLabel = fromNode ? (fromNode.label || edge.from) : edge.from;
    const toLabel = toNode ? (toNode.label || edge.to) : edge.to;

    if (hdrToolbar) {
        hdrToolbar.style.display = 'flex';
        const titleEl = document.getElementById('headerEdgeTitle');
        if (titleEl) titleEl.textContent = 'Connection:';

        const nodesEl = document.getElementById('headerEdgeNodes');
        if (nodesEl) nodesEl.textContent = `${fromLabel} ➔ ${toLabel}`;
    }
}

/**
 * Returns the current active edge ID: selected in vis.js OR the last one tracked
 * (used so toolbar buttons still work after the canvas fires a deselectEdge on mousedown).
 */
export function getActiveEdgeId() {
    if (state.network) {
        const sel = state.network.getSelectedEdges();
        if (sel && sel.length > 0) return String(sel[0]);
    }
    if (runtime.lastSelectedEdgeId) return runtime.lastSelectedEdgeId;
    if (state.contextClickedEdge) return String(state.contextClickedEdge);
    return null;
}
