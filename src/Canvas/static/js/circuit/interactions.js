import { state } from '../state.js';
import { api } from '../api.js';
import { runtime } from './runtime.js';
import { BEND_MODES } from './constants.js';
import { snapToGrid, computeEdgeLines, getEdgeFoldHandlePos } from './geometry.js';
import { cycleEdgeFoldMode, getEdgeAtCanvasPos } from './edges.js';
import { updateConnectBanner, cancelWireCreation, addWireWaypoint, popWireWaypoint, finishWireCreation } from './wiring.js';
// ── Interactive Event Handlers ────────────────────────────────────

export function initCanvasInteractions() {
    if (runtime.listenersBound || !runtime.container) return;
    runtime.listenersBound = true;

    // Track mouse on canvas and update live preview
    runtime.container.addEventListener('mousemove', (e) => {
        if (!state.network) return;
        const rect = runtime.container.getBoundingClientRect();
        const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const canvasPos = state.network.DOMtoCanvas(domPos);

        runtime.currentMouseGrid = snapToGrid(canvasPos.x, canvasPos.y);

        if (state.currentMode === 'connect') {
            const oldHover = runtime.hoveredTargetNode;
            runtime.hoveredTargetNode = state.network.getNodeAt(domPos);

            if (runtime.wireStartNode !== null) {
                state.network.redraw();
            } else if (oldHover !== runtime.hoveredTargetNode) {
                state.network.redraw();
            }
        } else if (state.currentMode === 'move') {
            const nodeAt = state.network.getNodeAt(domPos);
            const edgeAt = (!nodeAt && !runtime.activeFoldDrag) ? getEdgeAtCanvasPos(canvasPos, 10) : null;
            if (edgeAt) {
                runtime.container.style.cursor = 'pointer';
            } else if (!nodeAt && runtime.container.style.cursor === 'pointer') {
                runtime.container.style.cursor = '';
            }
        }
    });

    // Mouse down: start wire, place corner waypoint, or start fold drag
    runtime.container.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !state.network) return;

        const rect = runtime.container.getBoundingClientRect();
        const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const canvasPos = state.network.DOMtoCanvas(domPos);
        runtime.dragStartPos = domPos;
        runtime.waypointAddedOnMouseDown = false;

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
                        runtime.activeFoldDrag = {
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
            if (runtime.wireStartNode === null && clickedNode) {
                runtime.wireStartNode = clickedNode;
                runtime.isMouseDown = true;
                runtime.currentDragDir = null;
                runtime.wireWaypoints = [];
                runtime.waypointSteps = [];
                updateConnectBanner();
                state.network.redraw();
            } else if (runtime.wireStartNode !== null) {
                runtime.isMouseDown = true;
                if (!clickedNode) {
                    // Clicked empty canvas: drop intermediate corner waypoint(s)
                    addWireWaypoint(runtime.currentMouseGrid);
                    runtime.waypointAddedOnMouseDown = true;
                    updateConnectBanner();
                    state.network.redraw();
                }
            }
        }
    });

    // Mouse move while dragging a fold handle
    window.addEventListener('mousemove', (e) => {
        if (!runtime.activeFoldDrag || !state.network) return;

        const rect = runtime.container.getBoundingClientRect();
        const mouseCanvas = state.network.DOMtoCanvas({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });

        const edge = state.edgesDataSet.get(runtime.activeFoldDrag.edgeId);
        if (!edge) return;

        const positions = state.network.getPositions();
        const fromPos = positions[String(edge.from)];
        const toPos   = positions[String(edge.to)];
        if (!fromPos || !toPos) return;

        const snapped = snapToGrid(mouseCanvas.x, mouseCanvas.y);
        const customFold = runtime.activeFoldDrag.foldMode === 'horizontal' ? snapped.x : snapped.y;

        edge.customFold = customFold;
        edge.foldMode = runtime.activeFoldDrag.foldMode;
        edge.lines = computeEdgeLines(fromPos, toPos, edge.foldMode, customFold);

        state.edgesDataSet.update(edge);
        state.network.redraw();
    });

    // Mouse up: finalize drag-connection, add waypoint fold, or finish fold drag
    runtime.container.addEventListener('mouseup', (e) => {
        if (e.button !== 0 || !state.network) return;

        const rect = runtime.container.getBoundingClientRect();
        const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const releasedNode = state.network.getNodeAt(domPos);

        // In connect mode:
        if (state.currentMode === 'connect' && runtime.wireStartNode !== null) {
            runtime.isMouseDown = false;
            runtime.currentDragDir = null;

            // 1. If released over a different block -> finish connection!
            if (releasedNode && String(releasedNode) !== String(runtime.wireStartNode)) {
                finishWireCreation(releasedNode);
                runtime.dragStartPos = null;
                runtime.waypointAddedOnMouseDown = false;
                return;
            }

            // 2. If released on the start block itself, do nothing
            if (releasedNode && String(releasedNode) === String(runtime.wireStartNode)) {
                runtime.dragStartPos = null;
                runtime.waypointAddedOnMouseDown = false;
                return;
            }

            // 3. If released on empty canvas and waypoint wasn't already added on mousedown:
            if (!releasedNode && !runtime.waypointAddedOnMouseDown && runtime.dragStartPos) {
                const dist = Math.hypot(domPos.x - runtime.dragStartPos.x, domPos.y - runtime.dragStartPos.y);
                if (dist > 15) {
                    addWireWaypoint(runtime.currentMouseGrid);
                    updateConnectBanner();
                    state.network.redraw();
                }
            }
            runtime.waypointAddedOnMouseDown = false;
        }
        runtime.dragStartPos = null;
    });

    // Window mouse up for fold dragging and global mouseup reset
    window.addEventListener('mouseup', () => {
        runtime.isMouseDown = false;
        if (runtime.activeFoldDrag) {
            const edge = state.edgesDataSet.get(runtime.activeFoldDrag.edgeId);
            if (edge) {
                api.updateEdge(edge.id, edge.lines, edge.edgeType, edge.foldMode, edge.customFold).catch(console.error);
            }
            runtime.activeFoldDrag = null;
            if (state.network) {
                state.network.setOptions({ interaction: { dragView: true, dragNodes: true } });
                state.network.redraw();
            }
        }
    });

    // Right-click in connect mode: pop last waypoint if any, else cancel wire creation
    runtime.container.addEventListener('contextmenu', (e) => {
        if (state.currentMode === 'connect' && runtime.wireStartNode !== null) {
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
                const curIdx = BEND_MODES.indexOf(runtime.previewBendMode);
                runtime.previewBendMode = BEND_MODES[(curIdx + 1) % BEND_MODES.length];
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
                if (runtime.wireStartNode !== null) {
                    e.preventDefault();
                    if (!popWireWaypoint()) {
                        cancelWireCreation();
                    }
                }
            } else if (e.key === 'Escape') {
                if (runtime.wireStartNode !== null) {
                    e.preventDefault();
                    cancelWireCreation();
                }
            }
        }
    });
}
