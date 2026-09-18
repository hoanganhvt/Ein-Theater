import { state } from '../state.js';
import { api } from '../api.js';
import { COLOR_TRACE, COLOR_SELECTED, TRACE_WIDTH, BEND_MODES } from './constants.js';
import { computeOrthogonalLines, computeEdgeLines, pointToSegmentDistance } from './geometry.js';
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
 * Returns rendering styling parameters based on connection type.
 */
export function getEdgeColors(edge, isSelected) {
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

export function updateEdgeIndices() {
    // All wires are uniform standard connections
}
