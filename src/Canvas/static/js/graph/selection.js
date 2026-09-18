import { state } from '../state.js';
import { openEditNodeModal } from '../modals.js';
import { getEdgeAtCanvasPos, updateEdgeUISelection, openEditEdgeModal } from '../circuit.js';
import { updateClipboardUI } from '../clipboard.js';
export function setupGraphSelection() {
    state.network.on('click', function (params) {
        if (state.currentMode === 'move' || state.currentMode === 'select') {
            if (!params.nodes || params.nodes.length === 0) {
                let edgeId = (params.edges && params.edges.length > 0) ? params.edges[0] : null;
                if (!edgeId && params.pointer && params.pointer.canvas) {
                    edgeId = getEdgeAtCanvasPos(params.pointer.canvas, 14);
                }
                if (edgeId) {
                    state.network.setSelection({ nodes: [], edges: [String(edgeId)] });
                    state.network.redraw();
                }
            }
        }
        updateEdgeUISelection();
    });

    state.network.on('doubleClick', function (params) {
        if (params.nodes && params.nodes.length === 1) {
            openEditNodeModal(params.nodes[0]);
        } else {
            let edgeId = (params.edges && params.edges.length === 1) ? params.edges[0] : null;
            if (!edgeId && params.pointer && params.pointer.canvas) {
                edgeId = getEdgeAtCanvasPos(params.pointer.canvas, 14);
            }
            if (edgeId) {
                openEditEdgeModal(edgeId);
            }
        }
    });

    const handleSelectionChange = () => {
        updateClipboardUI();
        updateEdgeUISelection();
    };

    state.network.on('select', handleSelectionChange);
    state.network.on('deselectNode', handleSelectionChange);
    state.network.on('deselectEdge', handleSelectionChange);
    handleSelectionChange();
}
