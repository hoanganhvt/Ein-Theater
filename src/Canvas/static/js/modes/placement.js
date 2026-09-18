import { state } from '../state.js';
import { openAddNodeModal } from '../modals.js';
export function setupCanvasClickAdd() {
    const container = document.getElementById('mynetwork');
    if (!container) return;

    container.addEventListener('click', (e) => {
        if (state.currentMode !== 'add') return;
        if (!state.network) return;

        // Ignore clicks on modals or context menu
        if (e.target.closest('#contextMenu') || e.target.closest('#nodeModal') || e.target.closest('#modalOverlay') || e.target.closest('#editLayerModal') || e.target.closest('#selectFolderModal')) return;

        const rect = container.getBoundingClientRect();
        const domX = e.clientX - rect.left;
        const domY = e.clientY - rect.top;

        // If clicked on an existing node, don't open modal
        const nodeAt = state.network.getNodeAt({ x: domX, y: domY });
        if (nodeAt) return;

        const canvasPos = state.network.DOMtoCanvas({ x: domX, y: domY });
        openAddNodeModal({
            x: Math.round(canvasPos.x),
            y: Math.round(canvasPos.y)
        });
    });
}
