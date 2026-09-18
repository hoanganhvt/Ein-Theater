import { state } from '../state.js';
import { runtime } from './runtime.js';
import { GRID_SIZE, BG_COLOR, DOT_COLOR, DOT_RADIUS } from './constants.js';
import { computeOrthogonalLines, computeEdgeLines, getEdgeFoldHandlePos } from './geometry.js';
import { getEdgeColors } from './edges.js';
// ── Drawing Functions ─────────────────────────────────────────────

/** Draw an arrowhead at (ax, ay) pointing away from (bx, by). */
function drawArrowhead(ctx, ax, ay, bx, by, color) {
    const angle = Math.atan2(ay - by, ax - bx);
    const size = 9;
    const spread = 0.45;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(
        ax - size * Math.cos(angle - spread),
        ay - size * Math.sin(angle - spread)
    );
    ctx.lineTo(
        ax - size * Math.cos(angle + spread),
        ay - size * Math.sin(angle + spread)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/** Draw the diamond fold handle for dragging edge folds. */
function drawFoldHandle(ctx, x, y, foldMode, isDragging) {
    ctx.save();
    ctx.fillStyle   = isDragging ? '#f59e0b' : '#38bdf8';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth   = 2;

    const s = isDragging ? 9 : 7;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/** Draw the circuit grid background directly in network coordinates. */
export function drawGrid(ctx) {
    if (!state.network || !runtime.container) return;

    const scale = state.network.getScale();
    const vp    = state.network.getViewPosition();
    const halfW = (runtime.container.clientWidth  / (2 * scale)) + 100;
    const halfH = (runtime.container.clientHeight / (2 * scale)) + 100;

    const left   = vp.x - halfW;
    const right  = vp.x + halfW;
    const top    = vp.y - halfH;
    const bottom = vp.y + halfH;

    // At a small fit-to-graph scale, drawing every 50-unit dot can produce
    // millions of canvas calls per frame. Thin the visual grid only; snapping
    // and wire geometry still use GRID_SIZE at every zoom level.
    const stride = GRID_SIZE * Math.max(1, 2 ** Math.ceil(Math.log2(12 / (GRID_SIZE * scale))));
    const sx = Math.floor(left / stride) * stride;
    const sy = Math.floor(top / stride) * stride;

    ctx.save();
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(left, top, halfW * 2, halfH * 2);

    ctx.fillStyle = DOT_COLOR;
    const dotR = Math.max(0.7, Math.min(2.5, DOT_RADIUS / scale));
    ctx.beginPath();
    for (let x = sx; x <= right; x += stride) {
        for (let y = sy; y <= bottom; y += stride) {
            ctx.moveTo(x + dotR, y);
            ctx.arc(x, y, dotR, 0, Math.PI * 2);
        }
    }
    ctx.fill();
    ctx.restore();
}

/**
 * Draw all edges as compound objects of multiple straight lines (`lines` attribute).
 */
export function drawCircuitEdges(ctx) {
    if (!state.network || !state.edgesDataSet) return;
    const selIds    = new Set(state.network.getSelectedEdges());
    const positions = state.network.getPositions();

    state.edgesDataSet.get().forEach(edge => {
        if (state.nodesDataSet && (!state.nodesDataSet.get(String(edge.from)) || !state.nodesDataSet.get(String(edge.to)))) {
            state.edgesDataSet.remove(edge.id);
            return;
        }
        const fromPos = positions[String(edge.from)];
        const toPos   = positions[String(edge.to)];
        if (!fromPos || !toPos) return;

        let lines = edge.lines;
        if (!lines || lines.length === 0) {
            lines = (edge.customFold !== null && edge.customFold !== undefined)
                ? computeEdgeLines(fromPos, toPos, edge.foldMode || 'horizontal', edge.customFold)
                : computeOrthogonalLines(fromPos, toPos, edge.foldMode || 'horizontal');
            edge.lines = lines;
        }

        const isSelected = selIds.has(edge.id);
        const edgeInfo = getEdgeColors(edge, isSelected);

        ctx.save();
        ctx.strokeStyle = edgeInfo.trace;
        ctx.fillStyle   = edgeInfo.fill;
        ctx.lineWidth   = edgeInfo.width;
        ctx.lineCap     = 'square';
        ctx.lineJoin    = 'miter';

        lines.forEach(line => {
            const p1 = line.first || line.from;
            const p2 = line.last  || line.to;
            if (!p1 || !p2) return;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        });

        ctx.restore();
    });
}

/**
 * Draw decorations: junction dots, arrowheads, and draggable fold handles.
 */
export function drawEdgeDecorations(ctx) {
    if (!state.network || !state.edgesDataSet) return;
    const selIds    = new Set(state.network.getSelectedEdges());
    const positions = state.network.getPositions();

    state.edgesDataSet.get().forEach(edge => {
        if (state.nodesDataSet && (!state.nodesDataSet.get(String(edge.from)) || !state.nodesDataSet.get(String(edge.to)))) {
            return;
        }
        const fromPos = positions[String(edge.from)];
        const toPos   = positions[String(edge.to)];
        if (!fromPos || !toPos) return;

        let lines = edge.lines;
        if (!lines || lines.length === 0) {
            lines = (edge.customFold !== null && edge.customFold !== undefined)
                ? computeEdgeLines(fromPos, toPos, edge.foldMode || 'horizontal', edge.customFold)
                : computeOrthogonalLines(fromPos, toPos, edge.foldMode || 'horizontal');
            edge.lines = lines;
        }
        if (!lines || lines.length === 0) return;

        const isSelected = selIds.has(edge.id);
        const edgeInfo = getEdgeColors(edge, isSelected);

        ctx.save();
        ctx.fillStyle   = edgeInfo.fill;
        ctx.strokeStyle = edgeInfo.trace;

        // Draw junction dots at internal corners/bends
        if (lines.length > 1) {
            for (let i = 0; i < lines.length - 1; i++) {
                const corner = lines[i].last || lines[i].to;
                if (corner) {
                    ctx.beginPath();
                    ctx.arc(corner.x, corner.y, 3.5, 0, Math.PI * 2);
                    ctx.fillStyle = edgeInfo.dot;
                    ctx.fill();
                }
            }
        }

        // Draw directional arrowhead entering the destination node box
        const lastLine = lines[lines.length - 1];
        const p1 = lastLine.first || lastLine.from;
        const p2 = lastLine.last  || lastLine.to;
        if (p1 && p2) {
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const offX = Math.cos(angle) * 70;
            const offY = Math.sin(angle) * 25;
            const arrowX = p2.x - offX;
            const arrowY = p2.y - offY;
            drawArrowhead(ctx, arrowX, arrowY, p1.x, p1.y, edgeInfo.trace);
        }

        // If edge is selected, draw interactive diamond fold handle
        if (isSelected) {
            const handle = getEdgeFoldHandlePos(edge);
            if (handle) {
                const isDragging = runtime.activeFoldDrag && runtime.activeFoldDrag.edgeId === edge.id;
                drawFoldHandle(ctx, handle.x, handle.y, handle.foldMode, isDragging);
            }
        }

        ctx.restore();
    });
}
