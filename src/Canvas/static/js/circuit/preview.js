import { state } from '../state.js';
import { runtime } from './runtime.js';
import { COLOR_SELECTED, COLOR_PREVIEW, TRACE_WIDTH } from './constants.js';
import { snapToGrid, computeEdgeLines } from './geometry.js';
/**
 * Live preview when user is in Connect mode and drawing a new wire.
 * Renders all committed fold segments, active orthogonal segment to cursor or target,
 * and highlights hovered destination blocks.
 */
export function drawConnectPreview(ctx) {
    if (!state.network) return;

    // If no start node is selected yet, highlight hovered block to hint "click to connect"
    if (runtime.wireStartNode === null) {
        if (runtime.hoveredTargetNode) {
            const nodePos = (state.network.getPositions([String(runtime.hoveredTargetNode)]) || {})[String(runtime.hoveredTargetNode)];
            if (nodePos) {
                ctx.save();
                ctx.strokeStyle = 'rgba(22, 163, 74, 0.8)';
                ctx.lineWidth = 2.5;
                ctx.setLineDash([5, 4]);
                ctx.strokeRect(nodePos.x - 72, nodePos.y - 27, 144, 54);
                ctx.restore();
            }
        }
        return;
    }

    const positions = state.network.getPositions([String(runtime.wireStartNode)]);
    const fromPos = positions ? positions[String(runtime.wireStartNode)] : null;
    if (!fromPos || !runtime.currentMouseGrid) return;

    const fromGrid = snapToGrid(fromPos.x, fromPos.y);

    ctx.save();
    ctx.lineCap  = 'square';
    ctx.lineJoin = 'miter';

    // 0. Highlight the starting block
    ctx.save();
    ctx.strokeStyle = '#00e07a';
    ctx.fillStyle   = 'rgba(0, 224, 122, 0.12)';
    ctx.lineWidth   = 3;
    ctx.strokeRect(fromPos.x - 72, fromPos.y - 27, 144, 54);
    ctx.fillRect(fromPos.x - 72, fromPos.y - 27, 144, 54);
    // Origin junction terminal circle
    ctx.fillStyle = '#00e07a';
    ctx.beginPath();
    ctx.arc(fromPos.x, fromPos.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 1. Draw committed wire path segments so far: fromGrid -> waypoints...
    const committedPoints = [fromGrid, ...runtime.wireWaypoints];
    if (committedPoints.length >= 2) {
        ctx.save();
        ctx.strokeStyle = COLOR_SELECTED; // solid neon green
        ctx.fillStyle   = COLOR_SELECTED;
        ctx.lineWidth   = TRACE_WIDTH;
        ctx.setLineDash([]);

        for (let i = 0; i < committedPoints.length - 1; i++) {
            const p1 = committedPoints[i];
            const p2 = committedPoints[i + 1];
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Terminal dots at intermediate corners
            if (i > 0) {
                ctx.beginPath();
                ctx.arc(p1.x, p1.y, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        const lastPt = committedPoints[committedPoints.length - 1];
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 2. Active preview segment from last committed waypoint to hovered target block OR mouse cursor
    const tip = committedPoints[committedPoints.length - 1];
    let targetGrid = runtime.currentMouseGrid;
    let isHoveringTarget = false;

    if (runtime.hoveredTargetNode && String(runtime.hoveredTargetNode) !== String(runtime.wireStartNode)) {
        const targetPos = (state.network.getPositions([String(runtime.hoveredTargetNode)]) || {})[String(runtime.hoveredTargetNode)];
        if (targetPos) {
            targetGrid = snapToGrid(targetPos.x, targetPos.y);
            isHoveringTarget = true;
        }
    }

    if (tip.x !== targetGrid.x || tip.y !== targetGrid.y) {
        const activeSegs = computeEdgeLines(tip, targetGrid, runtime.previewBendMode);
        ctx.save();
        ctx.strokeStyle = COLOR_PREVIEW; // dashed bright green
        ctx.fillStyle   = COLOR_PREVIEW;
        ctx.lineWidth   = 2.5;
        ctx.setLineDash([7, 4]);

        activeSegs.forEach(seg => {
            const p1 = seg.first || seg.from;
            const p2 = seg.last  || seg.to;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        });

        // Corner junction dots on active preview segments
        if (activeSegs.length > 1) {
            ctx.setLineDash([]);
            for (let i = 0; i < activeSegs.length - 1; i++) {
                const corner = activeSegs[i].last || activeSegs[i].to;
                if (corner) {
                    ctx.beginPath();
                    ctx.arc(corner.x, corner.y, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.restore();
    }

    // 3. Draw cursor target dot
    ctx.setLineDash([]);
    ctx.fillStyle = COLOR_SELECTED;
    ctx.beginPath();
    ctx.arc(targetGrid.x, targetGrid.y, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // 4. Highlight hovered destination block
    if (isHoveringTarget) {
        const targetPos = (state.network.getPositions([String(runtime.hoveredTargetNode)]) || {})[String(runtime.hoveredTargetNode)];
        if (targetPos) {
            ctx.strokeStyle = '#00e07a';
            ctx.fillStyle   = 'rgba(0, 224, 122, 0.15)';
            ctx.lineWidth   = 3;
            ctx.strokeRect(targetPos.x - 72, targetPos.y - 27, 144, 54);
            ctx.fillRect(targetPos.x - 72, targetPos.y - 27, 144, 54);

            // Target terminal dot
            ctx.fillStyle = '#00e07a';
            ctx.beginPath();
            ctx.arc(targetPos.x, targetPos.y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}
