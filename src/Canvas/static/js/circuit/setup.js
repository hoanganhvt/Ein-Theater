import { state } from '../state.js';
import { runtime } from './runtime.js';
import { drawGrid, drawCircuitEdges, drawEdgeDecorations } from './drawing.js';
import { drawConnectPreview } from './preview.js';
import { initCanvasInteractions } from './interactions.js';
import { drawICDecorations } from './integrated.js';
// ── Public Setup ──────────────────────────────────────────────────

/**
 * Registers canvas hooks on state.network for the Falstad circuit aesthetic.
 * Must be called immediately after new vis.Network(...) is instantiated.
 */
export function setupCircuitCanvas() {
    if (!state.network) return;
    runtime.container = document.getElementById('mynetwork');

    initCanvasInteractions();

    state.network.on('beforeDrawing', (ctx) => {
        drawGrid(ctx);
        drawCircuitEdges(ctx);
    });

    state.network.on('afterDrawing', (ctx) => {
        drawEdgeDecorations(ctx);
        drawICDecorations(ctx);
        if (state.currentMode === 'connect') {
            drawConnectPreview(ctx);
        }
    });
}
