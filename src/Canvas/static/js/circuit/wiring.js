import { state } from '../state.js';
import { api } from '../api.js';
import { runtime } from './runtime.js';
import { BEND_LABELS } from './constants.js';
import { snapToGrid, simplifyLines, computeEdgeLines } from './geometry.js';
export function updateConnectBanner() {
    const banner = document.getElementById('modeBanner');
    if (!banner || state.currentMode !== 'connect') return;

    const bendLabel = BEND_LABELS[runtime.previewBendMode] || runtime.previewBendMode;

    if (runtime.wireStartNode === null) {
        banner.innerHTML = `<span><strong>Add Edge</strong> — Click a block to start wire. [Space] Bend: <strong>${bendLabel}</strong>. [Esc] Exit.</span>`;
    } else {
        const nodeData = state.nodesDataSet ? state.nodesDataSet.get(runtime.wireStartNode) : null;
        const nodeName = nodeData ? (nodeData.label || runtime.wireStartNode) : runtime.wireStartNode;
        const cornerCount = runtime.waypointSteps.length;
        const cornerHint = cornerCount > 0 ? ` (${cornerCount} corner${cornerCount > 1 ? 's' : ''} set, [Backspace] undo)` : '';
        banner.innerHTML = `<span>Connecting from <strong>${nodeName}</strong> — Click grid for corners, click target block.${cornerHint} [Space] Bend: <strong>${bendLabel}</strong>. [Esc] Cancel.</span>`;
    }
}

/**
 * Cancels any active in-progress wire drawing.
 */
export function cancelWireCreation() {
    runtime.wireStartNode = null;
    runtime.wireWaypoints = [];
    runtime.waypointSteps = [];
    runtime.wirePath = [];
    runtime.hoveredTargetNode = null;
    runtime.dragStartPos = null;
    runtime.isMouseDown = false;
    runtime.waypointAddedOnMouseDown = false;
    runtime.currentDragDir = null;
    runtime.previewBendMode = 'horizontal';
    updateConnectBanner();
    if (state.network) state.network.redraw();
}

/**
 * Adds an intermediate corner / fold waypoint to the in-progress wire.
 * Generates pure right-angle orthogonal segments from the last anchor to targetGrid.
 */
export function addWireWaypoint(targetGrid) {
    if (!targetGrid || !runtime.wireStartNode || !state.network) return;

    const positions = state.network.getPositions([String(runtime.wireStartNode)]);
    const fromPos = positions ? positions[String(runtime.wireStartNode)] : null;
    if (!fromPos) return;

    const fromGrid = snapToGrid(fromPos.x, fromPos.y);
    const lastAnchor = runtime.wireWaypoints.length > 0 ? runtime.wireWaypoints[runtime.wireWaypoints.length - 1] : fromGrid;

    if (targetGrid.x === lastAnchor.x && targetGrid.y === lastAnchor.y) return;

    const segs = computeEdgeLines(lastAnchor, targetGrid, runtime.previewBendMode);
    const addedPoints = [];
    for (const seg of segs) {
        const pt = seg.last || seg.to;
        if (pt) {
            const curLast = runtime.wireWaypoints.length > 0 ? runtime.wireWaypoints[runtime.wireWaypoints.length - 1] : lastAnchor;
            if (curLast.x !== pt.x || curLast.y !== pt.y) {
                runtime.wireWaypoints.push({ x: pt.x, y: pt.y });
                addedPoints.push({ x: pt.x, y: pt.y });
            }
        }
    }

    if (addedPoints.length > 0) {
        runtime.waypointSteps.push(addedPoints);
    }
}

/**
 * Removes the most recent corner waypoint step added during wire drawing.
 * Returns true if a waypoint step was removed, false if none remained.
 */
export function popWireWaypoint() {
    if (runtime.waypointSteps.length > 0) {
        const lastStep = runtime.waypointSteps.pop();
        for (let i = 0; i < lastStep.length; i++) {
            runtime.wireWaypoints.pop();
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
export async function finishWireCreation(targetNodeId) {
    if (runtime.isFinishingWire) return;
    if (!runtime.wireStartNode || !targetNodeId) {
        cancelWireCreation();
        return;
    }

    const fromId = String(runtime.wireStartNode);
    const toId   = String(targetNodeId);

    if (fromId === toId) {
        cancelWireCreation();
        return;
    }

    // Capture waypoints and preview bend mode before synchronously resetting state
    const waypoints = [...runtime.wireWaypoints];
    const bendMode = runtime.previewBendMode;

    cancelWireCreation();
    runtime.isFinishingWire = true;

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
            const created = await api.addEdge(fromId, toId, finalLines, bendMode, null, 'normal');
            const newEdge = {
                id: String(created.id),
                from: fromId,
                to: toId,
                edgeType: 'normal',
                lines: (created.lines && created.lines.length > 0) ? created.lines : finalLines,
                foldMode: bendMode,
                customFold: null,
                index: null,
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

            const fromNode = state.nodesDataSet ? state.nodesDataSet.get(fromId) : null;
            const toNode = state.nodesDataSet ? state.nodesDataSet.get(toId) : null;
            const fromLabel = fromNode ? (fromNode.label || fromId) : fromId;
            const toLabel = toNode ? (toNode.label || toId) : toId;
            if (typeof window.showToast === 'function') {
                window.showToast(`Connected: ${fromLabel} ➔ ${toLabel}`);
            }
        }

        state.network.redraw();
    } catch (err) {
        console.error('Failed to connect blocks:', err);
    } finally {
        runtime.isFinishingWire = false;
    }
}
