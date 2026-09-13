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
let _waypointSteps      = [];         // Array of arrays of points added per user click
let _wirePath           = [];         // Array of sequential {x, y} grid points for user-drawn wire trace
let _currentMouseGrid   = null;       // Current cursor snapped to grid {x, y}
let _hoveredTargetNode  = null;       // Target block under cursor (if any)
let _dragStartPos       = null;
let _isMouseDown        = false;
let _waypointAddedOnMouseDown = false;
let _previewBendMode    = 'horizontal'; // 'horizontal', 'vertical', 'l-horizontal', 'l-vertical'
let _currentDragDir     = null;       // 'H' or 'V' for tracking turns during continuous drag
let _isFinishingWire    = false;      // Re-entrancy guard to prevent duplicate edge creation
let _listenersBound     = false;
let _lastSelectedEdgeId = null;       // Tracks the most recently selected edge ID (persists across toolbar clicks)

export const BEND_MODES = ['horizontal', 'vertical', 'l-horizontal', 'l-vertical'];
export const BEND_LABELS = {
    'horizontal':   'Z-Horizontal (H-V-H)',
    'vertical':     'Z-Vertical (V-H-V)',
    'l-horizontal': 'L-Horizontal (H-V)',
    'l-vertical':   'L-Vertical (V-H)'
};

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
 * Delegates to computeEdgeLines to handle all orthogonal bend modes.
 */
export function computeOrthogonalLines(p1, p2, bendMode = 'horizontal') {
    return computeEdgeLines(p1, p2, bendMode);
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
    const foldMode = edge.foldMode || 'horizontal';

    if (!lines || lines.length === 0) {
        return computeEdgeLines(fromPos, toPos, foldMode, edge.customFold);
    }

    // If edge has a custom fold coordinate explicitly dragged by the user on a 3-segment edge:
    if (lines.length === 3 && edge.customFold !== null && edge.customFold !== undefined) {
        return computeEdgeLines(fromPos, toPos, foldMode, edge.customFold);
    }

    // If edge is a simple direct connection (1 straight line, 2-segment L-bend, or 3-segment Z-bend):
    if (lines.length <= 3) {
        return computeEdgeLines(fromPos, toPos, foldMode, edge.customFold);
    }

    // Edge with intermediate waypoints/corners:
    // Extract intermediate corners (junctions between segments)
    const corners = [];
    for (let i = 0; i < lines.length - 1; i++) {
        const pt = lines[i].last || lines[i].to;
        if (pt) corners.push({ x: pt.x, y: pt.y });
    }

    if (corners.length === 0) {
        return computeEdgeLines(fromPos, toPos, foldMode, edge.customFold);
    }

    // Preserve all intermediate corners: only re-route the first and last segments to new block positions
    const firstSegs = computeEdgeLines(fromPos, corners[0], foldMode);
    const middleSegs = [];
    for (let i = 0; i < corners.length - 1; i++) {
        const segs = computeEdgeLines(corners[i], corners[i + 1], 'l-horizontal');
        middleSegs.push(...segs);
    }
    const lastSegs = computeEdgeLines(corners[corners.length - 1], toPos, foldMode);

    return simplifyLines([...firstSegs, ...middleSegs, ...lastSegs]);
}

/**
 * Computes orthogonal straight line segments connecting two points on the grid.
 * Supports all 4 user-decided bend orientations:
 *   - 'horizontal':   Z-bend (H -> V -> H) with fold at midpoint or customFold
 *   - 'vertical':     Z-bend (V -> H -> V) with fold at midpoint or customFold
 *   - 'l-horizontal': L-bend (Horizontal then Vertical)
 *   - 'l-vertical':   L-bend (Vertical then Horizontal)
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

    // 3. L-bends
    if (foldMode === 'l-horizontal') {
        return [
            makeLine(x1, y1, x2, y1),
            makeLine(x2, y1, x2, y2)
        ];
    }
    if (foldMode === 'l-vertical') {
        return [
            makeLine(x1, y1, x1, y2),
            makeLine(x1, y2, x2, y2)
        ];
    }

    // 4. Z-bends
    if (foldMode === 'vertical') {
        let foldY = (customFold !== null && customFold !== undefined)
            ? customFold
            : Math.round(((y1 + y2) / 2) / GRID_SIZE) * GRID_SIZE;
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
        // Default: 'horizontal' Z-bend (horizontal -> vertical -> horizontal)
        let foldX = (customFold !== null && customFold !== undefined)
            ? customFold
            : Math.round(((x1 + x2) / 2) / GRID_SIZE) * GRID_SIZE;
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
 * Returns the canvas coordinates of the interactive diamond fold handle for an edge.
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
            foldMode: (p1.x === p2.x) ? 'horizontal' : 'vertical'
        };
    } else if (lines.length === 2) {
        const p = lines[0].last || lines[0].to;
        const l0 = lines[0];
        const p1 = l0.first || l0.from;
        const p2 = l0.last  || l0.to;
        return {
            x: p.x,
            y: p.y,
            foldMode: (p1 && p2 && p1.y === p2.y) ? 'horizontal' : 'vertical'
        };
    }
    return null;
}

/**
 * Cycles an edge's bend mode through all 4 orthogonal orientations:
 *   Z-Horizontal -> Z-Vertical -> L-Horizontal -> L-Vertical
 */
export function cycleEdgeFoldMode(edgeId) {
    if (!state.edgesDataSet || !state.network) return;
    const edge = state.edgesDataSet.get(edgeId);
    if (!edge) return;

    const positions = state.network.getPositions();
    const fromPos = positions[String(edge.from)];
    const toPos   = positions[String(edge.to)];
    if (!fromPos || !toPos) return;

    const currentMode = edge.foldMode || 'horizontal';
    const curIdx = BEND_MODES.indexOf(currentMode);
    const newMode = BEND_MODES[(curIdx + 1) % BEND_MODES.length];

    edge.foldMode = newMode;
    edge.customFold = null;
    edge.lines = computeEdgeLines(fromPos, toPos, newMode, null);

    state.edgesDataSet.update(edge);
    api.updateEdge(edge.id, edge.lines, edge.edgeType, newMode, null).catch(console.error);
    state.network.redraw();
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
    let newMode = 'vertical';
    if (currentMode === 'vertical') {
        newMode = 'horizontal';
    } else if (currentMode === 'l-horizontal') {
        newMode = 'l-vertical';
    } else if (currentMode === 'l-vertical') {
        newMode = 'l-horizontal';
    }

    edge.foldMode = newMode;
    edge.customFold = null;
    edge.lines = computeEdgeLines(fromPos, toPos, newMode, null);

    state.edgesDataSet.update(edge);
    api.updateEdge(edge.id, edge.lines, edge.edgeType, newMode, null).catch(console.error);
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

let _wireCreationType = 'normal';

export function setWireCreationType(type) {
    _wireCreationType = type;
    updateConnectBanner();
    if (typeof window.showToast === 'function') {
        const typeLabel = type === 'residual' ? 'Residual (+)' : (type === 'skip' ? 'Skip (Concat)' : 'Normal Flow');
        window.showToast(`🔗 New Wire Type: ${typeLabel}`);
    }
}

/**
 * Updates the connect mode banner message with active bend mode, type buttons, and corner count.
 */
export function updateConnectBanner() {
    const banner = document.getElementById('modeBanner');
    if (!banner || state.currentMode !== 'connect') return;

    const bendLabel = BEND_LABELS[_previewBendMode] || _previewBendMode;
    const curType = _wireCreationType || 'normal';

    const typeToggleHtml = `
        <span class="connect-type-toggle">
            <button class="connect-type-btn ${curType === 'normal' ? 'active' : ''}" onclick="setWireCreationType('normal')" title="Normal Flow (unindexed)">➡️ Normal</button>
            <button class="connect-type-btn ${curType === 'residual' ? 'active' : ''}" onclick="setWireCreationType('residual')" title="Residual Connection (indexed)">➕ Residual</button>
            <button class="connect-type-btn ${curType === 'skip' ? 'active' : ''}" onclick="setWireCreationType('skip')" title="Skip Connection (indexed)">⤿ Skip</button>
        </span>
    `;

    if (_wireStartNode === null) {
        banner.innerHTML = `<span>🔗 <strong>Add Edge</strong> — Click a block to start wire. [Space] Bend: <strong>${bendLabel}</strong>. Type: ${typeToggleHtml} [Esc] Exit.</span>`;
    } else {
        const nodeData = state.nodesDataSet ? state.nodesDataSet.get(_wireStartNode) : null;
        const nodeName = nodeData ? (nodeData.label || _wireStartNode) : _wireStartNode;
        const cornerCount = _waypointSteps.length;
        const cornerHint = cornerCount > 0 ? ` (${cornerCount} corner${cornerCount > 1 ? 's' : ''} set, [Backspace] undo)` : '';
        banner.innerHTML = `<span>🔗 Connecting from <strong>${nodeName}</strong> — Click grid for corners, click target block.${cornerHint} [Space] Bend: <strong>${bendLabel}</strong>. Type: ${typeToggleHtml} [Esc] Cancel.</span>`;
    }
}

/**
 * Cancels any active in-progress wire drawing.
 */
export function cancelWireCreation() {
    _wireStartNode = null;
    _wireWaypoints = [];
    _waypointSteps = [];
    _wirePath = [];
    _hoveredTargetNode = null;
    _dragStartPos = null;
    _isMouseDown = false;
    _waypointAddedOnMouseDown = false;
    _currentDragDir = null;
    _previewBendMode = 'horizontal';
    updateConnectBanner();
    if (state.network) state.network.redraw();
}

/**
 * Adds an intermediate corner / fold waypoint to the in-progress wire.
 * Generates pure right-angle orthogonal segments from the last anchor to targetGrid.
 */
export function addWireWaypoint(targetGrid) {
    if (!targetGrid || !_wireStartNode || !state.network) return;

    const positions = state.network.getPositions([String(_wireStartNode)]);
    const fromPos = positions ? positions[String(_wireStartNode)] : null;
    if (!fromPos) return;

    const fromGrid = snapToGrid(fromPos.x, fromPos.y);
    const lastAnchor = _wireWaypoints.length > 0 ? _wireWaypoints[_wireWaypoints.length - 1] : fromGrid;

    if (targetGrid.x === lastAnchor.x && targetGrid.y === lastAnchor.y) return;

    const segs = computeEdgeLines(lastAnchor, targetGrid, _previewBendMode);
    const addedPoints = [];
    for (const seg of segs) {
        const pt = seg.last || seg.to;
        if (pt) {
            const curLast = _wireWaypoints.length > 0 ? _wireWaypoints[_wireWaypoints.length - 1] : lastAnchor;
            if (curLast.x !== pt.x || curLast.y !== pt.y) {
                _wireWaypoints.push({ x: pt.x, y: pt.y });
                addedPoints.push({ x: pt.x, y: pt.y });
            }
        }
    }

    if (addedPoints.length > 0) {
        _waypointSteps.push(addedPoints);
    }
}

/**
 * Removes the most recent corner waypoint step added during wire drawing.
 * Returns true if a waypoint step was removed, false if none remained.
 */
export function popWireWaypoint() {
    if (_waypointSteps.length > 0) {
        const lastStep = _waypointSteps.pop();
        for (let i = 0; i < lastStep.length; i++) {
            _wireWaypoints.pop();
        }
        updateConnectBanner();
        if (state.network) state.network.redraw();
        return true;
    }
    return false;
}

export const extendWirePath = addWireWaypoint;

/**
 * Completes wire creation connecting _wireStartNode to targetNodeId.
 * Preserves user's exact drawn corners, bend mode, and right-angle geometry,
 * transmitting foldMode to the server and updating existing edges gracefully.
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

    // Capture waypoints and preview bend mode before synchronously resetting state
    const waypoints = [..._wireWaypoints];
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

        let finalLines = [];
        if (waypoints.length === 0) {
            finalLines = computeEdgeLines(fromGrid, toGrid, bendMode, null);
        } else {
            const pts = [fromGrid, ...waypoints, toGrid];
            const rawLines = [];
            for (let i = 0; i < pts.length - 1; i++) {
                const p1 = pts[i];
                const p2 = pts[i + 1];
                if (p1.x === p2.x && p1.y === p2.y) continue;
                if (p1.x === p2.x || p1.y === p2.y) {
                    rawLines.push({
                        first: { x: p1.x, y: p1.y },
                        last:  { x: p2.x, y: p2.y },
                        from:  { x: p1.x, y: p1.y },
                        to:    { x: p2.x, y: p2.y }
                    });
                } else {
                    const subSegs = computeEdgeLines(p1, p2, bendMode);
                    rawLines.push(...subSegs);
                }
            }
            finalLines = simplifyLines(rawLines);
            if (!finalLines || finalLines.length === 0) {
                finalLines = computeEdgeLines(fromGrid, toGrid, bendMode, null);
            }
        }

        // If an edge already exists between these blocks, update its lines and foldMode
        const existingEdge = state.edgesDataSet && state.edgesDataSet.get().find(
            e => String(e.from) === fromId && String(e.to) === toId
        );

        if (existingEdge) {
            existingEdge.lines = finalLines;
            existingEdge.foldMode = bendMode;
            existingEdge.customFold = null;
            state.edgesDataSet.update(existingEdge);
            await api.updateEdge(existingEdge.id, finalLines, existingEdge.edgeType, bendMode, null);
        } else {
            const wireType = _wireCreationType || 'normal';
            const created = await api.addEdge(fromId, toId, finalLines, bendMode, null, wireType);
            const newEdge = {
                id: String(created.id),
                from: fromId,
                to: toId,
                edgeType: created.edgeType || wireType,
                lines: (created.lines && created.lines.length > 0) ? created.lines : finalLines,
                foldMode: bendMode,
                customFold: null,
                index: (created.index !== undefined) ? created.index : null,
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

            // Re-sync all edge indices from backend
            try {
                const graphData = await api.fetchGraphData();
                if (graphData && graphData.edges) {
                    state.edgesDataSet.update(graphData.edges);
                }
            } catch (_) {}

            const typeLabel = wireType === 'residual' ? 'Residual Connection (+)' : (wireType === 'skip' ? 'Skip Connection (Concat)' : 'Normal Flow');
            const idxText = (newEdge.index !== null && newEdge.index !== undefined) ? ` #${newEdge.index}` : '';
            if (typeof window.showToast === 'function') {
                window.showToast(`🔗 Connected: ${typeLabel}${idxText}`);
            }
        }

        state.network.redraw();
    } catch (err) {
        console.error('Failed to connect blocks:', err);
    } finally {
        _isFinishingWire = false;
    }
}

/**
 * Calculates coordinates at a specified fractional distance along the edge's polyline.
 * By default fraction = 0.40 (40% along the path from source to target).
 */
export function getEdgeMidpoint(lines, fraction = 0.40) {
    if (!lines || lines.length === 0) return null;

    let totalLen = 0;
    const segs = [];
    for (const seg of lines) {
        const p1 = seg.first || seg.from;
        const p2 = seg.last  || seg.to;
        if (!p1 || !p2) continue;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
            segs.push({ p1, p2, len });
            totalLen += len;
        }
    }

    if (segs.length === 0) {
        const first = lines[0].first || lines[0].from;
        return first ? { x: first.x, y: first.y } : null;
    }

    const targetDist = totalLen * Math.max(0.1, Math.min(0.9, fraction));
    let accum = 0;
    for (const s of segs) {
        if (accum + s.len >= targetDist) {
            const rem = targetDist - accum;
            const t = rem / s.len;
            return {
                x: s.p1.x + (s.p2.x - s.p1.x) * t,
                y: s.p1.y + (s.p2.y - s.p1.y) * t
            };
        }
        accum += s.len;
    }

    const last = segs[segs.length - 1];
    return {
        x: (last.p1.x + last.p2.x) / 2,
        y: (last.p1.y + last.p2.y) / 2
    };
}

/**
 * Checks whether an edge is a special connection (residual or skip connection).
 */
export function isSpecialEdge(edge) {
    if (!edge) return false;
    const t = String(edge.edgeType || '').trim().toLowerCase();
    return t === 'residual' || t === 'skip' || t.startsWith('res') || t.startsWith('skip');
}

/**
 * Returns the sequential 0-based index for a special edge.
 * If edge.index is not yet set by the backend, dynamically computes it
 * based on the edge's position in the special edges list so the badge is never missing.
 */
export function getOrComputeSpecialEdgeIndex(edge) {
    if (!edge) return 0;
    if (edge.index !== undefined && edge.index !== null && !isNaN(edge.index)) {
        return Number(edge.index);
    }
    if (state.edgesDataSet) {
        const specialEdges = state.edgesDataSet.get().filter(e => isSpecialEdge(e));
        specialEdges.sort((a, b) => {
            const aHas = (a.index !== undefined && a.index !== null && !isNaN(a.index));
            const bHas = (b.index !== undefined && b.index !== null && !isNaN(b.index));
            if (aHas && bHas) return Number(a.index) - Number(b.index);
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            return String(a.id).localeCompare(String(b.id));
        });
        const idx = specialEdges.findIndex(e => String(e.id) === String(edge.id));
        if (idx !== -1) return idx;
    }
    return 0;
}

/**
 * Computes an optimal on-wire coordinate for placing the edge index badge.
 * Selects the longest straight orthogonal segment so the badge never collides
 * with 90° corners, block boundaries, or the interactive fold handle diamond (at 50% of segment 1).
 */
export function getEdgeBadgePosition(edge) {
    if (!edge || !edge.lines || edge.lines.length === 0) return null;
    const lines = edge.lines;

    const getEnds = (seg) => ({
        p1: seg.first || seg.from,
        p2: seg.last || seg.to
    });

    if (lines.length === 1) {
        const { p1, p2 } = getEnds(lines[0]);
        if (!p1 || !p2) return null;
        return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, isHorizontal: p1.y === p2.y };
    }

    if (lines.length === 2) {
        // L-bend: Pick the longer segment and center the badge at 50%
        const s0 = getEnds(lines[0]);
        const s1 = getEnds(lines[1]);
        const len0 = s0.p1 && s0.p2 ? Math.hypot(s0.p2.x - s0.p1.x, s0.p2.y - s0.p1.y) : 0;
        const len1 = s1.p1 && s1.p2 ? Math.hypot(s1.p2.x - s1.p1.x, s1.p2.y - s1.p1.y) : 0;
        const target = (len0 >= len1) ? s0 : s1;
        return {
            x: (target.p1.x + target.p2.x) / 2,
            y: (target.p1.y + target.p2.y) / 2,
            isHorizontal: target.p1.y === target.p2.y
        };
    }

    // 3 or more segments (e.g. standard Z-bend)
    let maxLen = -1;
    let maxIdx = 0;
    const segInfo = lines.map((seg, idx) => {
        const ends = getEnds(seg);
        const len = (ends.p1 && ends.p2) ? Math.hypot(ends.p2.x - ends.p1.x, ends.p2.y - ends.p1.y) : 0;
        if (len > maxLen) {
            maxLen = len;
            maxIdx = idx;
        }
        return { ends, len };
    });

    // If longest segment is segment 1 (middle segment of 3), the fold handle is at 0.50.
    // Offset badge to 0.28 along that segment so they never collide!
    let t = 0.5;
    if (lines.length === 3 && maxIdx === 1) {
        t = 0.28;
    }

    const chosen = segInfo[maxIdx];
    const p1 = chosen.ends.p1;
    const p2 = chosen.ends.p2;
    if (!p1 || !p2) return null;

    return {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
        isHorizontal: p1.y === p2.y
    };
}

/**
 * Returns rendering styling parameters based on connection type.
 */
export function getEdgeColors(edge, isSelected) {
    const rawType = String(edge ? (edge.edgeType || '') : '').trim().toLowerCase();
    if (rawType === 'residual' || rawType.startsWith('res')) {
        return {
            trace: isSelected ? '#d8b4fe' : '#a855f7', // purple
            fill: isSelected ? '#d8b4fe' : '#a855f7',
            dot: isSelected ? '#f3e8ff' : '#c084fc',
            width: isSelected ? 3.5 : 2.5,
            isSpecial: true,
            type: 'residual',
            badgePrefix: 'RES'
        };
    }
    if (rawType === 'skip' || rawType.startsWith('skip')) {
        return {
            trace: isSelected ? '#67e8f9' : '#06b6d4', // cyan
            fill: isSelected ? '#67e8f9' : '#06b6d4',
            dot: isSelected ? '#cffafe' : '#22d3ee',
            width: isSelected ? 3.5 : 2.5,
            isSpecial: true,
            type: 'skip',
            badgePrefix: 'SKIP'
        };
    }
    // Normal feedforward connection
    return {
        trace: isSelected ? COLOR_SELECTED : COLOR_TRACE,
        fill: isSelected ? COLOR_SELECTED : COLOR_TRACE,
        dot: isSelected ? COLOR_SELECTED : COLOR_TRACE,
        width: isSelected ? 3.5 : TRACE_WIDTH,
        isSpecial: false,
        type: 'normal',
        badgePrefix: ''
    };
}

/**
 * Draws the prominent edge index badge directly on special wire traces (e.g. RES #0, SKIP #1).
 * Features high-contrast solid capsule pill, drop shadow, crisp border, and bold typography.
 */
function drawEdgeIndexBadge(ctx, x, y, edge, edgeInfo, isSelected, indexVal) {
    const prefix = edgeInfo.badgePrefix || (edgeInfo.type === 'skip' ? 'SKIP' : 'RES');
    const idx = (indexVal !== undefined && indexVal !== null) ? indexVal : getOrComputeSpecialEdgeIndex(edge);
    const text = `${prefix} #${idx}`;

    let borderColor = edgeInfo.trace;
    let bgColor = '#1e1b4b';
    let textColor = '#ffffff';

    if (edgeInfo.type === 'residual') {
        bgColor = isSelected ? '#581c87' : '#6b21a8';
        borderColor = isSelected ? '#facc15' : '#c084fc';
        textColor = '#ffffff';
    } else if (edgeInfo.type === 'skip') {
        bgColor = isSelected ? '#155e75' : '#0891b2';
        borderColor = isSelected ? '#facc15' : '#38bdf8';
        textColor = '#ffffff';
    }

    ctx.save();
    ctx.font = 'bold 11px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textMetrics = ctx.measureText(text);
    const textW = textMetrics.width;
    const padX = 9;
    const h = 22;
    const w = Math.max(h, textW + padX * 2);
    const r = h / 2;

    const left = x - w / 2;
    const top = y - h / 2;

    // Glowing drop shadow for high contrast & standout visibility
    if (isSelected) {
        ctx.shadowColor = 'rgba(250, 204, 21, 0.7)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
    }

    // Rounded capsule badge body
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + w - r, top);
    ctx.arcTo(left + w, top, left + w, top + h, r);
    ctx.lineTo(left + w, top + h - r);
    ctx.arcTo(left + w, top + h, left + w - r, top + h, r);
    ctx.lineTo(left + r, top + h);
    ctx.arcTo(left, top + h, left, top + h - r, r);
    ctx.lineTo(left, top + r);
    ctx.arcTo(left, top, left + r, top, r);
    ctx.closePath();

    ctx.fillStyle = bgColor;
    ctx.fill();

    ctx.lineWidth = isSelected ? 2.5 : 1.8;
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    // Reset shadow before drawing crisp text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = textColor;
    ctx.fillText(text, x, y + 0.5);

    ctx.restore();
}

/**
 * Synchronizes contiguous 0-based indices strictly for special connections (residual, skip...).
 * Normal feedforward connections remain unindexed.
 */
export function updateEdgeIndices() {
    if (!state.edgesDataSet) return;
    const edges = state.edgesDataSet.get();
    if (!edges || edges.length === 0) return;

    // Normal edges first, special edges placed behind
    const normalEdges = edges.filter(e => !isSpecialEdge(e));
    const specialEdges = edges.filter(e => isSpecialEdge(e));

    // Sort special edges so existing indices (0, 1, 2...) are preserved,
    // and new special edges get the next available indices at the end
    specialEdges.sort((a, b) => {
        const aHas = (a.index !== undefined && a.index !== null && !isNaN(a.index));
        const bHas = (b.index !== undefined && b.index !== null && !isNaN(b.index));
        if (aHas && bHas) return Number(a.index) - Number(b.index);
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return String(a.id).localeCompare(String(b.id));
    });

    const updates = [];
    normalEdges.forEach(e => {
        if (e.index !== undefined && e.index !== null) {
            updates.push({ id: e.id, index: null });
        }
    });

    specialEdges.forEach((e, idx) => {
        if (e.index !== idx) {
            updates.push({ id: e.id, index: idx });
        }
    });

    if (updates.length > 0) {
        state.edgesDataSet.update(updates);
    }
}

/**
 * Sets the connection type of an edge (normal, residual, skip) and syncs backend state.
 */
export async function setSelectedEdgeType(edgeIdOrType, maybeType) {
    if (!state.network || !state.edgesDataSet) return;

    let edgeId = null;
    let newType = null;

    if (maybeType !== undefined) {
        edgeId = String(edgeIdOrType);
        newType = String(maybeType);
    } else {
        newType = String(edgeIdOrType);
        // Use getActiveEdgeId() so toolbar buttons work even after vis.js fires deselectEdge on mousedown
        edgeId = getActiveEdgeId();
    }

    if (!edgeId) return;

    try {
        const updated = await api.setEdgeType(edgeId, newType);
        // Refresh graph data to sync all edge indices simultaneously
        const graphData = await api.fetchGraphData();
        if (graphData && graphData.edges) {
            state.edgesDataSet.update(graphData.edges);
        } else {
            state.edgesDataSet.update(updated);
        }
        state.network.redraw();

        const typeLabel = newType === 'residual' ? 'Residual Connection (+)' : (newType === 'skip' ? 'Skip Connection (Concat)' : 'Normal Flow');
        const idxText = (updated.index !== undefined && updated.index !== null) ? ` (Indexed: #${updated.index})` : ' (Unindexed)';
        if (typeof window.showToast === 'function') {
            window.showToast(`🔀 Connection set to: ${typeLabel}${idxText}`);
        }
        updateEdgeUISelection();
    } catch (err) {
        console.error('Failed to set edge type:', err);
        if (typeof window.showToast === 'function') {
            window.showToast('Failed to set edge type: ' + err.message);
        }
    }
}

/**
 * Cycles the connection type of the currently selected edge:
 * normal -> residual -> skip -> normal.
 */
export async function cycleSelectedEdgeType(targetEdgeId = null) {
    if (!state.network || !state.edgesDataSet) return;

    let edgeId = targetEdgeId;
    if (!edgeId) {
        edgeId = getActiveEdgeId();
    }
    if (!edgeId) return;

    const edge = state.edgesDataSet.get(edgeId);
    if (!edge) return;

    const currentType = String(edge.edgeType || 'normal').toLowerCase();
    let nextType = 'residual';
    if (currentType.includes('res')) {
        nextType = 'skip';
    } else if (currentType.includes('skip')) {
        nextType = 'normal';
    } else {
        nextType = 'residual';
    }

    await setSelectedEdgeType(edgeId, nextType);
}

/**
 * Synchronizes the Top Header Edge Toolbar whenever an edge is selected or deselected.
 */
export function updateEdgeUISelection() {
    if (!state.network || !state.edgesDataSet) return;

    const selectedEdges = state.network.getSelectedEdges();
    const hdrToolbar = document.getElementById('headerEdgeToolbar');

    if (!selectedEdges || selectedEdges.length !== 1) {
        if (hdrToolbar) hdrToolbar.style.display = 'none';
        // Do NOT clear _lastSelectedEdgeId here — toolbar buttons are clicked after deselectEdge fires
        return;
    }

    const edgeId = String(selectedEdges[0]);
    const edge = state.edgesDataSet.get(edgeId);
    if (!edge) {
        if (hdrToolbar) hdrToolbar.style.display = 'none';
        return;
    }

    // Track the currently selected edge so toolbar buttons can still use it even
    // after vis.js deselects the edge on mousedown outside the canvas element
    _lastSelectedEdgeId = edgeId;

    const rawType = String(edge.edgeType || 'normal').toLowerCase();
    const isRes = rawType.includes('res');
    const isSkip = rawType.includes('skip');
    const isNorm = (!rawType || rawType === 'normal' || rawType === 'data' || (!isRes && !isSkip));

    const fromNode = state.nodesDataSet ? state.nodesDataSet.get(String(edge.from)) : null;
    const toNode = state.nodesDataSet ? state.nodesDataSet.get(String(edge.to)) : null;
    const fromLabel = fromNode ? (fromNode.label || edge.from) : edge.from;
    const toLabel = toNode ? (toNode.label || edge.to) : edge.to;

    const typeName = isRes ? 'Residual' : (isSkip ? 'Skip' : 'Normal');
    const isSpecial = isRes || isSkip;
    const indexVal = isSpecial ? getOrComputeSpecialEdgeIndex(edge) : null;
    const idxBadge = (indexVal !== null && indexVal !== undefined) ? ` #${indexVal}` : '';

    // Update Header Toolbar
    if (hdrToolbar) {
        hdrToolbar.style.display = 'flex';
        const titleEl = document.getElementById('headerEdgeTitle');
        if (titleEl) titleEl.textContent = `Edge (${typeName}${idxBadge}):`;

        const nodesEl = document.getElementById('headerEdgeNodes');
        if (nodesEl) nodesEl.textContent = `${fromLabel} ➔ ${toLabel}`;

        const btnNorm = document.getElementById('hdrBtnNormal');
        const btnRes = document.getElementById('hdrBtnResidual');
        const btnSkip = document.getElementById('hdrBtnSkip');

        if (btnNorm) btnNorm.className = `btn-edge-pill ${isNorm ? 'active active-normal' : ''}`;
        if (btnRes) btnRes.className = `btn-edge-pill ${isRes ? 'active active-residual' : ''}`;
        if (btnSkip) btnSkip.className = `btn-edge-pill ${isSkip ? 'active active-skip' : ''}`;
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
    if (_lastSelectedEdgeId) return _lastSelectedEdgeId;
    if (state.contextClickedEdge) return String(state.contextClickedEdge);
    return null;
}

// ── Edit Edge Modal Operations ───────────────────────────────────

let _currentEditingEdgeId = null;
let _modalSelectedEdgeType = 'normal';

export function openEditEdgeModal(targetEdgeId = null) {
    if (!state.network || !state.edgesDataSet) return;

    try {
        let edgeId = targetEdgeId;
        if (!edgeId) {
            edgeId = getActiveEdgeId();
        }
        if (!edgeId) return;

        const edge = state.edgesDataSet.get(edgeId) ||
                     state.edgesDataSet.get(String(edgeId)) ||
                     (state.edgesDataSet.get().find(e => String(e.id) === String(edgeId)));
        if (!edge) return;

        _currentEditingEdgeId = String(edge.id || edgeId);
        const curType = String(edge.edgeType || 'normal').toLowerCase();
        _modalSelectedEdgeType = curType.includes('res') ? 'residual' : (curType.includes('skip') ? 'skip' : 'normal');

        const fromNode = state.nodesDataSet ? (state.nodesDataSet.get(String(edge.from)) || state.nodesDataSet.get(edge.from)) : null;
        const toNode = state.nodesDataSet ? (state.nodesDataSet.get(String(edge.to)) || state.nodesDataSet.get(edge.to)) : null;
        const fromLabel = fromNode ? (fromNode.label || edge.from) : edge.from;
        const toLabel = toNode ? (toNode.label || edge.to) : edge.to;

        const fromEl = document.getElementById('editEdgeFromLabel');
        const toEl = document.getElementById('editEdgeToLabel');
        const badgeEl = document.getElementById('editEdgeTypeBadge');
        if (fromEl) fromEl.textContent = fromLabel;
        if (toEl) toEl.textContent = toLabel;
        if (badgeEl) badgeEl.textContent = _modalSelectedEdgeType.toUpperCase();

        selectModalEdgeType(_modalSelectedEdgeType);

        const foldSelect = document.getElementById('editEdgeFoldSelect');
        if (foldSelect) {
            foldSelect.value = edge.foldMode || 'horizontal';
        }

        const modal = document.getElementById('editEdgeModal');
        const overlay = document.getElementById('modalOverlay');
        if (modal) {
            modal.style.display = 'block';
            if (overlay) overlay.style.display = 'block';
        } else {
            console.error('editEdgeModal dialog element was not found in the DOM.');
        }
    } catch (err) {
        console.error('Error opening edit edge modal:', err);
    }
}

export function closeEditEdgeModal() {
    const modal = document.getElementById('editEdgeModal');
    const overlay = document.getElementById('modalOverlay');
    if (modal) modal.style.display = 'none';

    const nodeModal = document.getElementById('nodeModal');
    const editLayerModal = document.getElementById('editLayerModal');
    const folderModal = document.getElementById('selectFolderModal');
    const otherModalOpen = (nodeModal && nodeModal.style.display === 'block') ||
                           (editLayerModal && editLayerModal.style.display === 'block') ||
                           (folderModal && folderModal.style.display === 'block');
    if (overlay && !otherModalOpen) {
        overlay.style.display = 'none';
    }
    _currentEditingEdgeId = null;
}

export function selectModalEdgeType(type) {
    _modalSelectedEdgeType = type;
    const cardNorm = document.getElementById('cardNormal');
    const cardRes = document.getElementById('cardResidual');
    const cardSkip = document.getElementById('cardSkip');

    const radioNorm = document.getElementById('radioNormal');
    const radioRes = document.getElementById('radioResidual');
    const radioSkip = document.getElementById('radioSkip');

    if (cardNorm) cardNorm.classList.toggle('selected', type === 'normal');
    if (cardRes) cardRes.classList.toggle('selected', type === 'residual');
    if (cardSkip) cardSkip.classList.toggle('selected', type === 'skip');

    if (radioNorm) radioNorm.checked = (type === 'normal');
    if (radioRes) radioRes.checked = (type === 'residual');
    if (radioSkip) radioSkip.checked = (type === 'skip');

    const badgeEl = document.getElementById('editEdgeTypeBadge');
    if (badgeEl) badgeEl.textContent = type.toUpperCase();
}

export async function saveEditEdgeModal() {
    if (!_currentEditingEdgeId) {
        closeEditEdgeModal();
        return;
    }
    const edgeId = _currentEditingEdgeId;
    const newType = _modalSelectedEdgeType;
    const foldSelect = document.getElementById('editEdgeFoldSelect');
    const newFoldMode = foldSelect ? foldSelect.value : 'horizontal';

    try {
        const edge = state.edgesDataSet.get(edgeId);
        if (edge) {
            edge.foldMode = newFoldMode;
            const fromPos = state.network.getPositions([String(edge.from)])[String(edge.from)];
            const toPos = state.network.getPositions([String(edge.to)])[String(edge.to)];
            if (fromPos && toPos) {
                edge.lines = computeEdgeLines(fromPos, toPos, newFoldMode, edge.customFold);
            }
            state.edgesDataSet.update(edge);
            await api.updateEdge(edgeId, edge.lines, newType, newFoldMode, edge.customFold);
        }

        await setSelectedEdgeType(edgeId, newType);
        closeEditEdgeModal();
        updateEdgeUISelection();
    } catch (err) {
        console.error('Failed to save edge:', err);
        if (typeof window.showToast === 'function') {
            window.showToast('Failed to save connection: ' + err.message);
        }
    }
}

export async function deleteEdgeFromModal() {
    if (!_currentEditingEdgeId) return;
    const edgeId = _currentEditingEdgeId;
    closeEditEdgeModal();
    await deleteEdgeById(edgeId);
}

export async function deleteSelectedEdge() {
    const edgeId = getActiveEdgeId();
    if (edgeId) {
        _lastSelectedEdgeId = null; // Clear after delete
        await deleteEdgeById(edgeId);
    }
}

export const deleteSelectedEdgeFromBar = deleteSelectedEdge;

export async function deleteEdgeById(edgeId) {
    if (!edgeId || !state.edgesDataSet) return;
    try {
        await api.deleteEdge(edgeId);
        state.edgesDataSet.remove(edgeId);
        updateEdgeIndices();
        updateEdgeUISelection();
        if (state.network) state.network.redraw();
        if (typeof window.showToast === 'function') {
            window.showToast('🗑️ Connection deleted');
        }
    } catch (err) {
        console.error('Failed to delete edge:', err);
    }
}

export async function handleSidebarConnectionType(edgeType) {
    const selectedEdges = state.network ? state.network.getSelectedEdges() : [];
    if (selectedEdges && selectedEdges.length > 0) {
        // Apply directly to currently selected edge!
        await setSelectedEdgeType(selectedEdges[0], edgeType);
        updateEdgeUISelection();
    } else {
        // No edge selected -> enter Connect Mode with this connection type pre-selected!
        setWireCreationType(edgeType);
        const { setMode } = await import('./modes.js');
        setMode('connect');
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
                const isDragging = _activeFoldDrag && _activeFoldDrag.edgeId === edge.id;
                drawFoldHandle(ctx, handle.x, handle.y, handle.foldMode, isDragging);
            }
        }

        // ONLY draw edge index badge for special connections (residual, skip...)
        if (edgeInfo.isSpecial) {
            const badgePos = getEdgeBadgePosition(edge) || getEdgeMidpoint(lines, 0.40);
            if (badgePos) {
                const indexVal = getOrComputeSpecialEdgeIndex(edge);
                drawEdgeIndexBadge(ctx, badgePos.x, badgePos.y, edge, edgeInfo, isSelected, indexVal);
            }
        }

        ctx.restore();
    });
}

/**
 * Live preview when user is in Connect mode and drawing a new wire.
 * Renders all committed fold segments, active orthogonal segment to cursor or target,
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
    const committedPoints = [fromGrid, ..._wireWaypoints];
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
    let targetGrid = _currentMouseGrid;
    let isHoveringTarget = false;

    if (_hoveredTargetNode && String(_hoveredTargetNode) !== String(_wireStartNode)) {
        const targetPos = (state.network.getPositions([String(_hoveredTargetNode)]) || {})[String(_hoveredTargetNode)];
        if (targetPos) {
            targetGrid = snapToGrid(targetPos.x, targetPos.y);
            isHoveringTarget = true;
        }
    }

    if (tip.x !== targetGrid.x || tip.y !== targetGrid.y) {
        const activeSegs = computeEdgeLines(tip, targetGrid, _previewBendMode);
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

    // Mouse down: start wire, place corner waypoint, or start fold drag
    _container.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !state.network) return;

        const rect = _container.getBoundingClientRect();
        const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const canvasPos = state.network.DOMtoCanvas(domPos);
        _dragStartPos = domPos;
        _waypointAddedOnMouseDown = false;

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

        // 2. In connect mode:
        if (state.currentMode === 'connect') {
            const clickedNode = state.network.getNodeAt(domPos);
            if (_wireStartNode === null && clickedNode) {
                _wireStartNode = clickedNode;
                _isMouseDown = true;
                _currentDragDir = null;
                _wireWaypoints = [];
                _waypointSteps = [];
                updateConnectBanner();
                state.network.redraw();
            } else if (_wireStartNode !== null) {
                _isMouseDown = true;
                if (!clickedNode) {
                    // Clicked empty canvas: drop intermediate corner waypoint(s)
                    addWireWaypoint(_currentMouseGrid);
                    _waypointAddedOnMouseDown = true;
                    updateConnectBanner();
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
                _waypointAddedOnMouseDown = false;
                return;
            }

            // 2. If released on the start block itself, do nothing
            if (releasedNode && String(releasedNode) === String(_wireStartNode)) {
                _dragStartPos = null;
                _waypointAddedOnMouseDown = false;
                return;
            }

            // 3. If released on empty canvas and waypoint wasn't already added on mousedown:
            if (!releasedNode && !_waypointAddedOnMouseDown && _dragStartPos) {
                const dist = Math.hypot(domPos.x - _dragStartPos.x, domPos.y - _dragStartPos.y);
                if (dist > 15) {
                    addWireWaypoint(_currentMouseGrid);
                    updateConnectBanner();
                    state.network.redraw();
                }
            }
            _waypointAddedOnMouseDown = false;
        }
        _dragStartPos = null;
    });

    // Window mouse up for fold dragging and global mouseup reset
    window.addEventListener('mouseup', () => {
        _isMouseDown = false;
        if (_activeFoldDrag) {
            const edge = state.edgesDataSet.get(_activeFoldDrag.edgeId);
            if (edge) {
                api.updateEdge(edge.id, edge.lines, edge.edgeType, edge.foldMode, edge.customFold).catch(console.error);
            }
            _activeFoldDrag = null;
            if (state.network) {
                state.network.setOptions({ interaction: { dragView: true, dragNodes: true } });
                state.network.redraw();
            }
        }
    });

    // Right-click in connect mode: pop last waypoint if any, else cancel wire creation
    _container.addEventListener('contextmenu', (e) => {
        if (state.currentMode === 'connect' && _wireStartNode !== null) {
            e.preventDefault();
            e.stopPropagation();
            if (!popWireWaypoint()) {
                cancelWireCreation();
            }
        }
    });

    // Keyboard shortcuts:
    // • Spacebar:
    //     - In Connect mode: cycle bend mode ('horizontal' -> 'vertical' -> 'l-horizontal' -> 'l-vertical')
    //     - In Move/Select mode with an edge selected: cycle selected edge's bend mode
    // • Backspace / Delete:
    //     - In Connect mode: pop last placed corner waypoint
    // • Escape:
    //     - In Connect mode with active wire: cancel wire creation
    window.addEventListener('keydown', (e) => {
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (e.key === ' ' || e.code === 'Space') {
            if (state.currentMode === 'connect') {
                e.preventDefault();
                const curIdx = BEND_MODES.indexOf(_previewBendMode);
                _previewBendMode = BEND_MODES[(curIdx + 1) % BEND_MODES.length];
                updateConnectBanner();
                if (state.network) state.network.redraw();
                return;
            }

            if (state.currentMode === 'move' || state.currentMode === 'select') {
                if (state.network) {
                    const selEdges = state.network.getSelectedEdges();
                    if (selEdges && selEdges.length === 1) {
                        e.preventDefault();
                        cycleEdgeFoldMode(selEdges[0]);
                        return;
                    }
                }
            }
        }

        if (state.currentMode === 'connect') {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                if (_wireStartNode !== null) {
                    e.preventDefault();
                    if (!popWireWaypoint()) {
                        cancelWireCreation();
                    }
                }
            } else if (e.key === 'Escape') {
                if (_wireStartNode !== null) {
                    e.preventDefault();
                    cancelWireCreation();
                }
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
