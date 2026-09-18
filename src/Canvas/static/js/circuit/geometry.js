import { GRID_SIZE } from './constants.js';
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
