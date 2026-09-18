import { state } from '../state.js';
import { api } from '../api.js';
import { cancelWireCreation } from '../circuit.js';
import { updateClipboardUI } from '../clipboard.js';
import { loadGraph } from './loading.js';
export function fitView() {
    if (state.network) {
        state.network.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
    }
}

export async function clearGraph() {
    if (!confirm('Clear the entire canvas? This cannot be undone.')) return;
    try {
        cancelWireCreation();
        await api.clearGraph();
        if (state.nodesDataSet) state.nodesDataSet.clear();
        if (state.edgesDataSet) state.edgesDataSet.clear();
        if (state.network) {
            state.network.unselectAll();
            state.network.redraw();
        }
        updateClipboardUI();
    } catch (e) {
        console.error('Failed to clear graph:', e);
        loadGraph();
    }
}
