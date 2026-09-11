// ── Circuit Board Canvas Rendering ───────────────────────────────
// Mimics the Falstad circuit-simulator aesthetic:
//   • Electrical schematic dot grid
//   • Edges viewed as compound objects with multiple straight lines (`lines` attribute)
//   • Interactive Wire Drawing:
//       - Click/drag to start a wire from any block
//       - Live orthogonal dashed preview follows the cursor on the grid
//       - Click on the grid to create corners / fold points (supports multiple lines!)
//       - Hover over target block (shows glowing highlight) and click to connect
//       - Cancel wire creation anytime via Esc or right-click
//   • Post-connection fold editing:
//       - Drag the diamond fold handle on any selected edge to position the fold
//       - Invert fold orientation (Horizontal ⇄ Vertical) via double-click or context menu
//       - Sharp 90° right angles preserved on grid at all times
//       - User-defined folds preserved when moving blocks

import { state } from './state.js';
import { api } from './api.js';

// ── Constants ─────────────────────────────────────────────────────

export const GRID_SIZE = 50;          // Grid spacing in network-coordinate units

const BG_COLOR       = '#f8fafc';     // Clean schematic canvas background
const DOT_COLOR      = 'rgba(71, 85, 105, 0.35)'; // Visible circuit grid dots
const COLOR_TRACE    = '#16a34a';     // Standard wire trace (circuit green)
const COLOR_SELECTED = '#00e07a';     // Selected wire (bright neon green)
const COLOR_PREVIEW  = 'rgba(0, 224, 122, 0.90)'; // Live preview trace
const TRACE_WIDTH    = 2.5;           // Wire stroke width
const DOT_RADIUS     = 1.8;           // Grid dot radius

// ── Module State ──────────────────────────────────────────────────

let _container          = null;
let _activeFoldDrag     = null;       // Active fold drag state: { edgeId, foldMode }
let _wireStartNode      = null;       // Node ID where new wire started
let _wireWaypoints      = [];         // Array of intermediate {x, y} grid folds
let _wirePath           = [];         // Array of sequential {x, y} grid points for user-drawn wire trace
let _currentMouseGrid   = null;       // Current cursor snapped to grid {x, y}
let _hoveredTargetNode  = null;       // Target block under cursor (if any)
let _dragStartPos       = null;
let _isMouseDown        = false;
let _previewBendMode    = 'horizontal'; // 'horizontal' (H then V) or 'vertical' (V then H)
let _currentDragDir     = null;       // 'H' or 'V' for tracking turns during continuous drag
let _isFinishingWire    = false;      // Re-entrancy guard to prevent duplicate edge creation
let _listenersBound     = false;

// ── Public Helpers ────────────────────────────────────────────────

/** Snap a network-coordinate pair to the nearest grid point. */
export function snapToGrid(x, y) {
    return {
        x: Math.round(x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(y / GRID_SIZE) * GRID_SIZE
    };
}

/**
 * Computes pure right-angle straight line segments between two points.
 * If p1 and p2 differ in both x and y, creates an orthogonal 2-segment L-bend
 * oriented according to bendMode ('horizontal' = H then V; 'vertical' = V then H).
 */
export function computeOrthogonalLines(p1, p2, bendMode = 'horizontal') {
    if (!p1 || !p2) return [];
    const x1 = p1.x;
    const y1 = p1.y;
    const x2 = p2.x;
    const y2 = p2.y;

    if (x1 === x2 && y1 === y2) return [];

    const makeLine = (ax, ay, bx, by) => ({
        first: { x: ax, y: ay },
        last:  { x: bx, y: by },
        from:  { x: ax, y: ay },
        to:    { x: bx, y: by }
    });

    // 1. Single horizontal line
    if (y1 === y2) {
        return [makeLine(x1, y1, x2, y2)];
    }

    // 2. Single vertical line
    if (x1 === x2) {
        return [makeLine(x1, y1, x2, y2)];
    }

    // 3. Orthogonal 2-segment L-bend
    if (bendMode === 'vertical') {
        return [
            makeLine(x1, y1, x1, y2),
            makeLine(x1, y2, x2, y2)
        ];
    } else {
        return [
            makeLine(x1, y1, x2, y1),
            makeLine(x2, y1, x2, y2)
        ];
    }
}

/**
 * Simplifies an array of line segments by removing zero-length segments
 * and merging consecutive collinear segments.
 */
export function simplifyLines(lines) {
    if (!lines || lines.length === 0) return [];
    const valid = lines.filter(l => {
        const p1 = l.first || l.from;
        const p2 = l.last  || l.to;
        return p1 && p2 && (p1.x !== p2.x || p1.y !== p2.y);
    });
    if (valid.length <= 1) return valid;

    const result = [];
    let cur = {
        first: { x: valid[0].first.x, y: valid[0].first.y },
        last:  { x: valid[0].last.x,  y: valid[0].last.y }
    };

    for (let i = 1; i < valid.length; i++) {
        const next = valid[i];
        const p1 = next.first || next.from;
        const p2 = next.last  || next.to;

        const curHoriz = cur.first.y === cur.last.y && cur.last.y === p1.y && p1.y === p2.y;
        const curVert  = cur.first.x === cur.last.x && cur.last.x === p1.x && p1.x === p2.x;

        if (curHoriz || curVert) {
            cur.last = { x: p2.x, y: p2.y };
        } else {
            result.push({
                first: { ...cur.first },
                last:  { ...cur.last },
                from:  { ...cur.first },
                to:    { ...cur.last }
            });
            cur = {
                first: { x: p1.x, y: p1.y },
                last:  { x: p2.x, y: p2.y }
            };
        }
    }

    result.push({
        first: { ...cur.first },
        last:  { ...cur.last },
        from:  { ...cur.first },
        to:    { ...cur.last }
    });

    return result;
}

/**
 * Updates edge lines when connected nodes are dragged while preserving
 * all intermediate user-created corner waypoints and user-drawn fold geometry.
 */
export function updateEdgeEndpoints(edge, fromPos, toPos) {
    if (!edge || !fromPos || !toPos) return [];
    const lines = edge.lines;
    if (!lines || lines.length === 0) {
        return computeOrthogonalLines(fromPos, toPos, edge.foldMode || 'horizontal');
    }

    // If edge has a custom fold coordinate explicitly dragged by the user on a 3-segment edge:
    if (lines.length === 3 && edge.customFold !== null && edge.customFold !== undefined) {
        return computeEdgeLines(fromPos, toPos, edge.foldMode || 'horizontal', edge.customFold);
    }

    // If edge is a simple direct connection (1 straight line or 2-segment L-bend):
    if (lines.length <= 2) {
        return computeOrthogonalLines(fromPos, toPos, edge.foldMode || 'horizontal');
    }

    // Edge with intermediate waypoints/corners:
    // Extract intermediate corners (junctions between segments)
    const corners = [];
    for (let i = 0; i < lines.length - 1; i++) {
        const pt = lines[i].last || lines[i].to;
        if (pt) corners.push({ x: pt.x, y: pt.y });
    }

    if (corners.length === 0) {
        return computeOrthogonalLines(fromPos, toPos, edge.foldMode || 'horizontal');
    }

    // Preserve all intermediate corners: only re-route the first and last segments to new block positions
    const firstSegs = computeOrthogonalLines(fromPos, corners[0], edge.foldMode || 'horizontal');
    const middleSegs = [];
    for (let i = 0; i < corners.length - 1; i++) {
        const segs = computeOrthogonalLines(corners[i], corners[i + 1]);
        middleSegs.push(...segs);
    }
    const lastSegs = computeOrthogonalLines(corners[corners.length - 1], toPos, edge.foldMode || 'horizontal');

    return simplifyLines([...firstSegs, ...middleSegs, ...lastSegs]);
}

/**
 * Computes orthogonal straight line segments connecting two points on the grid.
 * Supports user-decided fold orientation ('horizontal' or 'vertical') and
 * optional custom fold coordinate (customFold = foldX or foldY).
 *
 * Each element format:
 * {
 *   first: { x, y },
 *   last:  { x, y },
 *   from:  { x, y },
 *   to:    { x, y }
 * }
 */
export function computeEdgeLines(fromPos, toPos, foldMode = 'horizontal', customFold = null) {
    if (!fromPos || !toPos) return [];
    const x1 = fromPos.x;
    const y1 = fromPos.y;
    const x2 = toPos.x;
    const y2 = toPos.y;

    if (x1 === x2 && y1 === y2) return [];

    const makeLine = (px1, py1, px2, py2) => ({
        first: { x: px1, y: py1 },
        last:  { x: px2, y: py2 },
        from:  { x: px1, y: py1 },
        to:    { x: px2, y: py2 }
    });

    // 1. Single straight horizontal line
    if (y1 === y2) {
        return [makeLine(x1, y1, x2, y2)];
    }

    // 2. Single straight vertical line
    if (x1 === x2) {
        return [makeLine(x1, y1, x2, y2)];
    }

    // 3. User-decided fold mode
    if (foldMode === 'vertical') {
        let foldY = customFold !== null ? customFold : Math.round(((y1 + y2) / 2) / GRID_SIZE) * GRID_SIZE;
        if (foldY === y1 || foldY === y2) {
            return [
                makeLine(x1, y1, x1, y2),
                makeLine(x1, y2, x2, y2)
            ];
        }
        return [
            makeLine(x1, y1, x1, foldY),
            makeLine(x1, foldY, x2, foldY),
            makeLine(x2, foldY, x2, y2)
        ];
    } else {
        let foldX = customFold !== null ? customFold : Math.round(((x1 + x2) / 2) / GRID_SIZE) * GRID_SIZE;
        if (foldX === x1 || foldX === x2) {
            return [
                makeLine(x1, y1, x2, y1),
                makeLine(x2, y1, x2, y2)
            ];
        }
        return [
            makeLine(x1, y1, foldX, y1),
            makeLine(foldX, y1, foldX, y2),
            makeLine(foldX, y2, x2, y2)
        ];
    }
}

/**
 * Returns the canvas coordinates of the interactive fold handle for an edge.
 */
export function getEdgeFoldHandlePos(edge) {
    if (!edge || !edge.lines || edge.lines.length < 2) return null;
    const lines = edge.lines;
    const foldMode = edge.foldMode || 'horizontal';

    if (lines.length === 3) {
        const mid = lines[1];
        const p1 = mid.first || mid.from;
        const p2 = mid.last  || mid.to;
        return {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2,
            foldMode: foldMode
        };
    } else if (lines.length === 2) {
        const p = lines[0].last || lines[0].to;
        return {
            x: p.x,
            y: p.y,
            foldMode: foldMode
        };
    }
    return null;
}

/**
 * Inverts an edge's fold mode (Horizontal ⇄ Vertical) and recalculates its lines.
 */
export function invertEdgeFold(edgeId) {
    if (!state.edgesDataSet || !state.network) return;
    const edge = state.edgesDataSet.get(edgeId);
    if (!edge) return;

    const positions = state.network.getPositions();
    const fromPos = positions[String(edge.from)];
    const toPos   = positions[String(edge.to)];
    if (!fromPos || !toPos) return;

    const currentMode = edge.foldMode || 'horizontal';
    const newMode = currentMode === 'horizontal' ? 'vertical' : 'horizontal';

    edge.foldMode = newMode;
    edge.customFold = null;
    edge.lines = computeEdgeLines(fromPos, toPos, newMode);

    state.edgesDataSet.update(edge);
    api.updateEdge(edge.id, edge.lines).catch(console.error);
    state.network.redraw();
}

/**
 * Calculates perpendicular distance from point (px, py) to line segment (x1, y1)-(x2, y2).
 */
export function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        return Math.hypot(px - x1, py - y1);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    return Math.hypot(px - projX, py - projY);
}

/**
 * Finds the ID of the edge whose straight orthogonal lines pass within tolerance of canvasPos.
 * Returns the edge ID string, or null if no edge was hit.
 */
export function getEdgeAtCanvasPos(canvasPos, tolerance = 14) {
    if (!canvasPos || !state.edgesDataSet || !state.network) return null;

    const edges = state.edgesDataSet.get();
    if (!edges || edges.length === 0) return null;

    const scale = state.network.getScale() || 1;
    const tol = Math.max(tolerance, tolerance / scale);

    for (const edge of edges) {
        let lines = edge.lines;
        if (!lines || lines.length === 0) {
            const positions = state.network.getPositions([String(edge.from), String(edge.to)]);
            const fn = positions ? positions[String(edge.from)] : null;
            const tn = positions ? positions[String(edge.to)] : null;
            if (fn && tn) {
                lines = computeOrthogonalLines(fn, tn, edge.foldMode || 'horizontal');
                edge.lines = lines;
            }
        }
        if (!lines || lines.length === 0) continue;

        for (const seg of lines) {
            const p1 = seg.first || seg.from;
            const p2 = seg.last  || seg.to;
            if (!p1 || !p2) continue;

            const dist = pointToSegmentDistance(canvasPos.x, canvasPos.y, p1.x, p1.y, p2.x, p2.y);
            if (dist <= tol) {
                return String(edge.id);
            }
        }
    }
    return null;
}

/**
 * Cancels any active in-progress wire drawing.
 */
export function cancelWireCreation() {
    _wireStartNode = null;
    _wireWaypoints = [];
    _wirePath = [];
    _hoveredTargetNode = null;
    _dragStartPos = null;
    _isMouseDown = false;
    _currentDragDir = null;
    _previewBendMode = 'horizontal';
    const banner = document.getElementById('modeBanner');
    if (banner && state.currentMode === 'connect') {
        banner.innerHTML = '<span>🔗 <strong>Add Edge</strong> — Drag or click to draw wire path, click target block to connect. <strong>Esc</strong> to cancel.</span>';
    }
    if (state.network) state.network.redraw();
}

/**
 * Extends the user-drawn wire path to targetGrid, maintaining strictly sharp orthogonal
 * lines and removing previously drawn lines if the user backtracks / drags backward.
 */
export function extendWirePath(targetGrid) {
    if (!targetGrid || _wirePath.length === 0) return;

    const M = { x: targetGrid.x, y: targetGrid.y };
    let tip = _wirePath[_wirePath.length - 1];

    if (M.x === tip.x && M.y === tip.y) return;

    // 1. Check for BACKTRACKING:
    // If M lies on any previously drawn segment backwards from the tip, shrink or remove segments.
    while (_wirePath.length >= 2) {
        const N = _wirePath.length;
        const A = _wirePath[N - 2];
        const B = _wirePath[N - 1];

        // Check horizontal segment A -> B
        if (A.y === B.y && M.y === A.y) {
            const minX = Math.min(A.x, B.x);
            const maxX = Math.max(A.x, B.x);
            if (M.x >= minX && M.x <= maxX) {
                if (M.x === A.x) {
                    _wirePath.pop();
                    continue; // backtracked past corner A, check previous segment
                } else {
                    _wirePath[N - 1] = { x: M.x, y: M.y };
                    return;
                }
            }
        }

        // Check vertical segment A -> B
        if (A.x === B.x && M.x === A.x) {
            const minY = Math.min(A.y, B.y);
            const maxY = Math.max(A.y, B.y);
            if (M.y >= minY && M.y <= maxY) {
                if (M.y === A.y) {
                    _wirePath.pop();
                    continue; // backtracked past corner A, check previous segment
                } else {
                    _wirePath[N - 1] = { x: M.x, y: M.y };
                    return;
                }
            }
        }

        break;
    }

    // Refresh tip after potential backtracking removals
    const N = _wirePath.length;
    tip = _wirePath[N - 1];
    if (M.x === tip.x && M.y === tip.y) return;

    // 2. FORWARD EXTENSION with sharp 90-degree lines
    if (N === 1) {
        // First segment extending from starting block
        if (M.y === tip.y || M.x === tip.x) {
            _wirePath.push({ x: M.x, y: M.y });
        } else {
            if (_previewBendMode === 'horizontal' || Math.abs(M.x - tip.x) >= Math.abs(M.y - tip.y)) {
                _wirePath.push({ x: M.x, y: tip.y });
                _wirePath.push({ x: M.x, y: M.y });
            } else {
                _wirePath.push({ x: tip.x, y: M.y });
                _wirePath.push({ x: M.x, y: M.y });
            }
        }
    } else {
        const A = _wirePath[N - 2];
        const isHorizontal = (A.y === tip.y);

        if (isHorizontal) {
            if (M.y === tip.y) {
                // Moving along same horizontal line
                _wirePath[N - 1] = { x: M.x, y: tip.y };
            } else if (M.x === tip.x) {
                // Sharp 90-degree corner to vertical
                _wirePath.push({ x: tip.x, y: M.y });
            } else {
                // Diagonal: extend horizontal, then turn vertical
                _wirePath[N - 1] = { x: M.x, y: tip.y };
                _wirePath.push({ x: M.x, y: M.y });
            }
        } else {
            // Current segment is vertical
            if (M.x === tip.x) {
                // Moving along same vertical line
                _wirePath[N - 1] = { x: tip.x, y: M.y };
            } else if (M.y === tip.y) {
                // Sharp 90-degree corner to horizontal
                _wirePath.push({ x: M.x, y: tip.y });
            } else {
                // Diagonal: extend vertical, then turn horizontal
                _wirePath[N - 1] = { x: tip.x, y: M.y };
                _wirePath.push({ x: M.x, y: M.y });
            }
        }
    }
}

/**
 * Completes wire creation connecting _wireStartNode to targetNodeId through the user-drawn path.
 * Ensures the connection is an array of sharp straight lines obeying the user's exact drawing,
 * and updates existing edges gracefully without popping duplicate connection alerts.
 */
async function finishWireCreation(targetNodeId) {
    if (_isFinishingWire) return;
    if (!_wireStartNode || !targetNodeId) {
        cancelWireCreation();
        return;
    }

    const fromId = String(_wireStartNode);
    const toId   = String(targetNodeId);

    if (fromId === toId) {
        cancelWireCreation();
        return;
    }

    // Capture drawn path and preview bend mode before synchronously resetting state
    const rawPath = [..._wirePath];
    const bendMode = _previewBendMode;

    cancelWireCreation();
    _isFinishingWire = true;

    try {
        const positions = state.network.getPositions([fromId, toId]);
        const fromPos = positions ? positions[fromId] : null;
        const toPos   = positions ? positions[toId] : null;
        if (!fromPos || !toPos) {
            return;
        }

        const fromGrid = snapToGrid(fromPos.x, fromPos.y);
        const toGrid   = snapToGrid(toPos.x, toPos.y);

        let path = rawPath.length > 0 ? [...rawPath] : [{ ...fromGrid }];
        path[0] = { x: fromGrid.x, y: fromGrid.y };

        // Ensure path reaches the target node grid coordinate
        const last = path[path.length - 1];
        if (last.x !== toGrid.x || last.y !== toGrid.y) {
            if (last.x === toGrid.x || last.y === toGrid.y) {
                path.push({ x: toGrid.x, y: toGrid.y });
            } else {
                if (bendMode === 'vertical') {
                    path.push({ x: last.x, y: toGrid.y });
                    path.push({ x: toGrid.x, y: toGrid.y });
                } else {
                    path.push({ x: toGrid.x, y: last.y });
                    path.push({ x: toGrid.x, y: toGrid.y });
                }
            }
        }

        // Convert path points to an array of sharp line objects
        const rawLines = [];
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            if (p1.x === p2.x && p1.y === p2.y) continue;
            rawLines.push({
                first: { x: p1.x, y: p1.y },
                last:  { x: p2.x, y: p2.y },
                from:  { x: p1.x, y: p1.y },
                to:    { x: p2.x, y: p2.y }
            });
        }

        let finalLines = simplifyLines(rawLines);
        if (!finalLines || finalLines.length === 0) {
            finalLines = computeOrthogonalLines(fromPos, toPos, bendMode);
        }

        // If an edge already exists between these blocks, update its lines with what the user drew
        const existingEdge = state.edgesDataSet && state.edgesDataSet.get().find(
            e => String(e.from) === fromId && String(e.to) === toId
        );

        if (existingEdge) {
            existingEdge.lines = finalLines;
            existingEdge.foldMode = bendMode;
            state.edgesDataSet.update(existingEdge);
            await api.updateEdge(existingEdge.id, finalLines);
        } else {
            const created = await api.addEdge(fromId, toId, finalLines);
            const newEdge = {
                id: String(created.id),
                from: fromId,
                to: toId,
                lines: (created.lines && created.lines.length > 0) ? created.lines : finalLines,
                foldMode: bendMode,
                customFold: null,
                color: {
                    color:     'rgba(0,0,0,0)',
                    highlight: 'rgba(0,0,0,0)',
                    hover:     'rgba(0,0,0,0)',
                    inherit:   false,
                    opacity:   0
                },
                width: 10
            };
            state.edgesDataSet.add(newEdge);
        }

        state.network.redraw();
    } catch (err) {
        console.error('Failed to connect blocks:', err);
    } finally {
        _isFinishingWire = false;
    }
}

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
function drawGrid(ctx) {
    if (!state.network || !_container) return;

    const scale = state.network.getScale();
    const vp    = state.network.getViewPosition();
    const halfW = (_container.clientWidth  / (2 * scale)) + 100;
    const halfH = (_container.clientHeight / (2 * scale)) + 100;

    const left   = vp.x - halfW;
    const right  = vp.x + halfW;
    const top    = vp.y - halfH;
    const bottom = vp.y + halfH;

    const sx = Math.floor(left / GRID_SIZE) * GRID_SIZE;
    const sy = Math.floor(top  / GRID_SIZE) * GRID_SIZE;

    ctx.save();
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(left, top, halfW * 2, halfH * 2);

    ctx.fillStyle = DOT_COLOR;
    const dotR = Math.max(0.7, Math.min(2.5, DOT_RADIUS / scale));
    for (let x = sx; x <= right; x += GRID_SIZE) {
        for (let y = sy; y <= bottom; y += GRID_SIZE) {
            ctx.beginPath();
            ctx.arc(x, y, dotR, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

/**
 * Draw all edges as compound objects of multiple straight lines (`lines` attribute).
 */
function drawCircuitEdges(ctx) {
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
        const color = isSelected ? COLOR_SELECTED : COLOR_TRACE;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle   = color;
        ctx.lineWidth   = isSelected ? 3.5 : TRACE_WIDTH;
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
function drawEdgeDecorations(ctx) {
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
        const color = isSelected ? COLOR_SELECTED : COLOR_TRACE;

        ctx.save();
        ctx.fillStyle   = color;
        ctx.strokeStyle = color;

        // Draw junction dots at internal corners/bends
        if (lines.length > 1) {
            for (let i = 0; i < lines.length - 1; i++) {
                const corner = lines[i].last || lines[i].to;
                if (corner) {
                    ctx.beginPath();
                    ctx.arc(corner.x, corner.y, 3.5, 0, Math.PI * 2);
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
            drawArrowhead(ctx, arrowX, arrowY, p1.x, p1.y, color);
        }

        // If edge is selected, draw interactive diamond fold handle
        if (isSelected) {
            const handle = getEdgeFoldHandlePos(edge);
            if (handle) {
                const isDragging = _activeFoldDrag && _activeFoldDrag.edgeId === edge.id;
                drawFoldHandle(ctx, handle.x, handle.y, handle.foldMode, isDragging);
            }
        }

        ctx.restore();
    });
}

/**
 * Live preview when user is in Connect mode and drawing a new wire.
 * Renders all committed fold segments, active orthogonal segment to cursor,
 * and highlights hovered destination blocks.
 */
function drawConnectPreview(ctx) {
    if (!state.network) return;

    // If no start node is selected yet, highlight hovered block to hint "click to connect"
    if (_wireStartNode === null) {
        if (_hoveredTargetNode) {
            const nodePos = (state.network.getPositions([String(_hoveredTargetNode)]) || {})[String(_hoveredTargetNode)];
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

    const positions = state.network.getPositions([String(_wireStartNode)]);
    const fromPos = positions ? positions[String(_wireStartNode)] : null;
    if (!fromPos || !_currentMouseGrid) return;

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

    // 1. Draw drawn wire path segments so far (_wirePath)
    if (_wirePath.length >= 2) {
        ctx.strokeStyle = COLOR_SELECTED; // solid neon green
        ctx.fillStyle   = COLOR_SELECTED;
        ctx.lineWidth   = TRACE_WIDTH;
        ctx.setLineDash([]);

        for (let i = 0; i < _wirePath.length - 1; i++) {
            const p1 = _wirePath[i];
            const p2 = _wirePath[i + 1];
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Terminal dots at internal 90° corners
            if (i > 0) {
                ctx.beginPath();
                ctx.arc(p1.x, p1.y, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // 2. If mouse is up (user moving without dragging), draw preview from last path point to cursor
    if (!_isMouseDown) {
        const tip = _wirePath.length > 0 ? _wirePath[_wirePath.length - 1] : fromPos;
        const activeSegs = computeOrthogonalLines(tip, _currentMouseGrid, _previewBendMode);
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

        // Draw active corner indicator if 2 segments
        if (activeSegs.length === 2) {
            const corner = activeSegs[0].last || activeSegs[0].to;
            if (corner) {
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(0, 224, 122, 0.8)';
                ctx.beginPath();
                ctx.arc(corner.x, corner.y, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // 3. Draw cursor target dot
    ctx.setLineDash([]);
    ctx.fillStyle = COLOR_SELECTED;
    ctx.beginPath();
    ctx.arc(_currentMouseGrid.x, _currentMouseGrid.y, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // 4. Highlight hovered destination block
    if (_hoveredTargetNode && String(_hoveredTargetNode) !== String(_wireStartNode)) {
        const targetPos = (state.network.getPositions([String(_hoveredTargetNode)]) || {})[String(_hoveredTargetNode)];
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

// ── Interactive Event Handlers ────────────────────────────────────

function initCanvasInteractions() {
    if (_listenersBound || !_container) return;
    _listenersBound = true;

    // Track mouse on canvas and update live preview
    _container.addEventListener('mousemove', (e) => {
        if (!state.network) return;
        const rect = _container.getBoundingClientRect();
        const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const canvasPos = state.network.DOMtoCanvas(domPos);

        _currentMouseGrid = snapToGrid(canvasPos.x, canvasPos.y);

        if (state.currentMode === 'connect') {
            const oldHover = _hoveredTargetNode;
            _hoveredTargetNode = state.network.getNodeAt(domPos);

            if (_wireStartNode !== null) {
                if (_isMouseDown) {
                    extendWirePath(_currentMouseGrid);
                }
                state.network.redraw();
            } else if (oldHover !== _hoveredTargetNode) {
                state.network.redraw();
            }
        } else if (state.currentMode === 'move') {
            const nodeAt = state.network.getNodeAt(domPos);
            const edgeAt = (!nodeAt && !_activeFoldDrag) ? getEdgeAtCanvasPos(canvasPos, 10) : null;
            if (edgeAt) {
                _container.style.cursor = 'pointer';
            } else if (!nodeAt && _container.style.cursor === 'pointer') {
                _container.style.cursor = '';
            }
        }
    });

    // Mouse down: start wire or start fold drag
    _container.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !state.network) return;

        const rect = _container.getBoundingClientRect();
        const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const canvasPos = state.network.DOMtoCanvas(domPos);
        _dragStartPos = domPos;

        // 1. Check if user clicked a diamond fold handle to drag a fold, or clicked an edge wire
        if (state.currentMode === 'move' || state.currentMode === 'select') {
            const selEdgeIds = state.network.getSelectedEdges();
            if (selEdgeIds && selEdgeIds.length > 0) {
                for (const edgeId of selEdgeIds) {
                    const edge = state.edgesDataSet.get(edgeId);
                    if (!edge) continue;
                    const handle = getEdgeFoldHandlePos(edge);
                    if (!handle) continue;

                    const dist = Math.hypot(canvasPos.x - handle.x, canvasPos.y - handle.y);
                    if (dist <= 16) {
                        _activeFoldDrag = {
                            edgeId: edge.id,
                            foldMode: handle.foldMode
                        };
                        state.network.setOptions({ interaction: { dragView: false, dragNodes: false } });
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                }
            }

            // Check if user clicked directly on any orthogonal wire segment to select the connection
            const clickedNode = state.network.getNodeAt(domPos);
            if (!clickedNode) {
                const hitEdgeId = getEdgeAtCanvasPos(canvasPos, 14);
                if (hitEdgeId) {
                    state.network.setSelection({ nodes: [], edges: [String(hitEdgeId)] });
                    state.network.redraw();
                    return;
                }
            }
        }

        // 2. In connect mode: start a new wire if clicking a block
        if (state.currentMode === 'connect') {
            const clickedNode = state.network.getNodeAt(domPos);
            if (_wireStartNode === null && clickedNode) {
                _wireStartNode = clickedNode;
                _isMouseDown = true;
                _currentDragDir = null;

                const nodePos = (state.network.getPositions([String(clickedNode)]) || {})[String(clickedNode)];
                const startGrid = nodePos ? snapToGrid(nodePos.x, nodePos.y) : { ..._currentMouseGrid };
                _wirePath = [{ x: startGrid.x, y: startGrid.y }];
                _wireWaypoints = [];

                const nodeData = state.nodesDataSet ? state.nodesDataSet.get(clickedNode) : null;
                const nodeName = nodeData ? (nodeData.label || clickedNode) : clickedNode;
                const banner = document.getElementById('modeBanner');
                if (banner) {
                    banner.innerHTML = `<span>🔗 Connecting from <strong>${nodeName}</strong> — Drag or click to draw wire path, click target block to connect. <strong>Esc</strong> to cancel.</span>`;
                }
                state.network.redraw();
            } else if (_wireStartNode !== null) {
                _isMouseDown = true;
                if (!clickedNode) {
                    extendWirePath(_currentMouseGrid);
                    state.network.redraw();
                }
            }
        }
    });

    // Mouse move while dragging a fold handle
    window.addEventListener('mousemove', (e) => {
        if (!_activeFoldDrag || !state.network) return;

        const rect = _container.getBoundingClientRect();
        const mouseCanvas = state.network.DOMtoCanvas({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });

        const edge = state.edgesDataSet.get(_activeFoldDrag.edgeId);
        if (!edge) return;

        const positions = state.network.getPositions();
        const fromPos = positions[String(edge.from)];
        const toPos   = positions[String(edge.to)];
        if (!fromPos || !toPos) return;

        const snapped = snapToGrid(mouseCanvas.x, mouseCanvas.y);
        const customFold = _activeFoldDrag.foldMode === 'horizontal' ? snapped.x : snapped.y;

        edge.customFold = customFold;
        edge.foldMode = _activeFoldDrag.foldMode;
        edge.lines = computeEdgeLines(fromPos, toPos, edge.foldMode, customFold);

        state.edgesDataSet.update(edge);
        state.network.redraw();
    });

    // Mouse up: finalize drag-connection, add waypoint fold, or finish fold drag
    _container.addEventListener('mouseup', (e) => {
        if (e.button !== 0 || !state.network) return;

        const rect = _container.getBoundingClientRect();
        const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const releasedNode = state.network.getNodeAt(domPos);

        // In connect mode:
        if (state.currentMode === 'connect' && _wireStartNode !== null) {
            _isMouseDown = false;
            _currentDragDir = null;

            // 1. If released over a different block -> finish connection!
            if (releasedNode && String(releasedNode) !== String(_wireStartNode)) {
                finishWireCreation(releasedNode);
                _dragStartPos = null;
                return;
            }

            // 2. If released on the start block itself, do nothing
            if (releasedNode && String(releasedNode) === String(_wireStartNode)) {
                _dragStartPos = null;
                return;
            }

            // 3. If clicked or released on empty canvas -> add point to _wirePath
            if (!releasedNode && _dragStartPos) {
                extendWirePath(_currentMouseGrid);
                state.network.redraw();
            }
        }
        _dragStartPos = null;
    });

    // Window mouse up for fold dragging and global mouseup reset
    window.addEventListener('mouseup', () => {
        _isMouseDown = false;
        if (_activeFoldDrag) {
            const edge = state.edgesDataSet.get(_activeFoldDrag.edgeId);
            if (edge) {
                api.updateEdge(edge.id, edge.lines).catch(console.error);
            }
            _activeFoldDrag = null;
            if (state.network) {
                state.network.setOptions({ interaction: { dragView: true, dragNodes: true } });
                state.network.redraw();
            }
        }
    });

    // Right-click cancels in-progress wire creation
    _container.addEventListener('contextmenu', (e) => {
        if (state.currentMode === 'connect' && _wireStartNode !== null) {
            e.preventDefault();
            e.stopPropagation();
            cancelWireCreation();
        }
    });

    // Keyboard shortcuts in connect mode: Space flips bend, Escape cancels
    window.addEventListener('keydown', (e) => {
        if (state.currentMode === 'connect') {
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                _previewBendMode = _previewBendMode === 'horizontal' ? 'vertical' : 'horizontal';
                if (state.network) state.network.redraw();
                return;
            }
            if (e.key === 'Escape' && _wireStartNode !== null) {
                cancelWireCreation();
            }
        }
    });
}

// ── Public Setup ──────────────────────────────────────────────────

/**
 * Registers canvas hooks on state.network for the Falstad circuit aesthetic.
 * Must be called immediately after new vis.Network(...) is instantiated.
 */
export function setupCircuitCanvas() {
    if (!state.network) return;
    _container = document.getElementById('mynetwork');

    initCanvasInteractions();

    state.network.on('beforeDrawing', (ctx) => {
        drawGrid(ctx);
        drawCircuitEdges(ctx);
    });

    state.network.on('afterDrawing', (ctx) => {
        drawEdgeDecorations(ctx);
        if (state.currentMode === 'connect') {
            drawConnectPreview(ctx);
        }
    });
}
