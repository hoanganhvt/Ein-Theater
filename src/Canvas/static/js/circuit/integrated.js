import { state } from '../state.js';
/**
 * Draws realistic IC chip decorations (top notch, dual-in-line metallic pins, and pin 1 indicator)
 * for IntegratedModel blocks.
 */
export function drawICDecorations(ctx) {
    if (!state.network || !state.nodesDataSet) return;
    const nodes = state.nodesDataSet.get();
    nodes.forEach(n => {
        if (n.layerType === 'IntegratedModel' || (n.params && n.params.model_path)) {
            let box;
            try {
                box = state.network.getBoundingBox(n.id);
            } catch (_) {
                return;
            }
            if (!box) return;

            const h = box.bottom - box.top;
            const cx = (box.left + box.right) / 2;

            ctx.save();

            // 1. Draw IC Notch at top center
            ctx.beginPath();
            ctx.arc(cx, box.top, 7, 0, Math.PI);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 2. Draw metallic dual-in-line IC pins on left (inputs) and right (outputs) borders
            const pinW = 6;
            const pinH = 8;
            ctx.fillStyle = '#94a3b8'; // Metallic silver
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;

            const numPins = Math.max(2, Math.min(5, Math.floor(h / 24)));
            for (let i = 1; i <= numPins; i++) {
                const py = box.top + (h * i) / (numPins + 1) - pinH / 2;
                // Left pin
                ctx.fillRect(box.left - pinW, py, pinW, pinH);
                ctx.strokeRect(box.left - pinW, py, pinW, pinH);
                // Right pin
                ctx.fillRect(box.right, py, pinW, pinH);
                ctx.strokeRect(box.right, py, pinW, pinH);
            }

            // 3. Draw Pin 1 index dot at top-left
            ctx.beginPath();
            ctx.arc(box.left + 12, box.top + 12, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();

            ctx.restore();
        }
    });
}
