// ── Vis.js Canvas & Network Graph Core ────────────────────────────
import { state } from './state.js';
import { api } from './api.js';
import { LAYER_SCHEMAS, getDefaultParams, formatNodeLabel, getNodeDisplayName } from './schemas.js';
import { setMode } from './modes.js';
import { openAddNodeModal, openEditNodeModal } from './modals.js';
import { setupCircuitCanvas, snapToGrid, computeOrthogonalLines, computeEdgeLines, invertEdgeFold, updateEdgeEndpoints, getEdgeAtCanvasPos, cancelWireCreation } from './circuit.js';
import { updateClipboardUI } from './clipboard.js';

// Module-level tracking for dragging nodes with rigid edge geometry preservation
let _dragStartPositions     = null; // { [nodeId]: { x, y } }
let _dragStartInternalEdges = null; // { [edgeId]: { lines, foldMode, customFold } }
let _dragStartExternalEdges = null; // { [edgeId]: { lines, foldMode, customFold, from, to } }
let _draggedNodeIds         = null; // Set<string>
let _dragRefNodeId          = null; // string
let _dragRefStartPos        = null; // { x, y }

export async function loadGraph() {
    try {
        const data = await api.fetchGraphData();
        const container = document.getElementById('mynetwork');
        if (!container) return;

        const processedNodes = (data.nodes || []).map(n => {
            const baseType = n.layerType || (n.label || '').split('\n')[0].trim();
            const params = n.params || (LAYER_SCHEMAS[baseType] ? getDefaultParams(baseType) : {});
            const displayName = getNodeDisplayName(n);
            return {
                ...n,
                id: String(n.id),
                label: displayName,
                title: displayName,
                layerType: baseType,
                params: params,
                shape: n.shape || 'box'
            };
        });

        const processedEdges = (data.edges || []).map(e => {
            let lines = e.lines;
            const foldMode = e.foldMode || 'horizontal';
            if (!lines || lines.length === 0) {
                const fn = processedNodes.find(n => String(n.id) === String(e.from));
                const tn = processedNodes.find(n => String(n.id) === String(e.to));
                if (fn && tn) {
                    lines = computeOrthogonalLines({ x: fn.x, y: fn.y }, { x: tn.x, y: tn.y }, foldMode);
                }
            }
            return {
                ...e,
                id: String(e.id),
                from: String(e.from),
                to: String(e.to),
                lines: lines || [],
                foldMode: foldMode,
                customFold: e.customFold !== undefined ? e.customFold : null,
                color: {
                    color:     'rgba(0,0,0,0)',
                    highlight: 'rgba(0,0,0,0)',
                    hover:     'rgba(0,0,0,0)',
                    inherit:   false,
                    opacity:   0
                },
                width: 10
            };
        });

        state.nodesDataSet = new vis.DataSet(processedNodes);
        state.edgesDataSet = new vis.DataSet(processedEdges);

        if (data.name) {
            const titleEl = document.getElementById('modelTitle');
            if (titleEl) titleEl.textContent = data.name;
            document.title = data.name + ' – Neural Network Builder';
        }

        const graphData = { nodes: state.nodesDataSet, edges: state.edgesDataSet };

        const options = {
            manipulation: {
                enabled: false
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: true,
                multiselect: true,
                selectConnectedEdges: false
            },
            physics: { enabled: false },
            nodes: {
                shape: 'box',
                margin: 12,
                font: { size: 14, color: '#1a202c', face: 'Inter' },
                borderWidth: 1.5,
                color: {
                    background: '#ffffff',
                    border: '#4a5568',
                    highlight: { background: '#edf2f7', border: '#007acc' }
                },
                shadow: { enabled: true, color: 'rgba(0,0,0,0.08)', size: 6, x: 2, y: 2 }
            },
            edges: {
                // Keep Vis.js native edges completely invisible (opacity: 0, inherit: false).
                // All visual traces are drawn as sharp orthogonal circuit lines by circuit.js.
                width: 10,
                selectionWidth: 0,
                hoverWidth: 0,
                color: {
                    color:     'rgba(0,0,0,0)',
                    highlight: 'rgba(0,0,0,0)',
                    hover:     'rgba(0,0,0,0)',
                    inherit:   false,
                    opacity:   0
                },
                smooth: false,
                arrows: { to: { enabled: false } }
            }
        };

        if (state.network) state.network.destroy();
        state.network = new vis.Network(container, graphData, options);
        setMode(state.currentMode);

        // Initialise PCB-style grid background and orthogonal edge rendering
        setupCircuitCanvas();

        // Module-level helper to initialise baseline geometry when starting a drag
        function initDragTracking(params) {
            const clickedNodes = (params && params.nodes ? params.nodes : []).map(String);
            const selectedNodes = (state.network.getSelectedNodes() || []).map(String);

            let activeDragNodes;
            if (clickedNodes.some(id => selectedNodes.includes(id))) {
                activeDragNodes = Array.from(new Set([...selectedNodes, ...clickedNodes]));
            } else if (clickedNodes.length > 0) {
                activeDragNodes = clickedNodes;
            } else if (selectedNodes.length > 0) {
                activeDragNodes = selectedNodes;
            } else {
                activeDragNodes = [];
            }

            if (activeDragNodes.length === 0) {
                _dragStartPositions = null;
                _dragStartInternalEdges = null;
                _dragStartExternalEdges = null;
                _draggedNodeIds = null;
                _dragRefNodeId = null;
                _dragRefStartPos = null;
                return;
            }

            _draggedNodeIds = new Set(activeDragNodes);
            _dragRefNodeId = (clickedNodes.length > 0 && activeDragNodes.includes(clickedNodes[0]))
                ? clickedNodes[0]
                : activeDragNodes[0];

            const allPositions = state.network.getPositions();
            _dragStartPositions = {};
            activeDragNodes.forEach(id => {
                const raw = allPositions[id] || (state.nodesDataSet.get(id) ? { x: state.nodesDataSet.get(id).x, y: state.nodesDataSet.get(id).y } : { x: 0, y: 0 });
                _dragStartPositions[id] = { x: raw.x, y: raw.y };
            });
            _dragRefStartPos = { ..._dragStartPositions[_dragRefNodeId] };

            _dragStartInternalEdges = {};
            _dragStartExternalEdges = {};

            if (state.edgesDataSet) {
                state.edgesDataSet.get().forEach(edge => {
                    const fromId = String(edge.from);
                    const toId = String(edge.to);
                    const fromIn = _draggedNodeIds.has(fromId);
                    const toIn = _draggedNodeIds.has(toId);

                    if (fromIn && toIn) {
                        // Internal edge: both endpoints move together. Shape must remain 100% rigid.
                        let lines = edge.lines;
                        if (!lines || lines.length === 0) {
                            const fn = _dragStartPositions[fromId];
                            const tn = _dragStartPositions[toId];
                            if (fn && tn) {
                                lines = computeOrthogonalLines(fn, tn, edge.foldMode || 'horizontal');
                            }
                        }
                        _dragStartInternalEdges[edge.id] = {
                            lines: JSON.parse(JSON.stringify(lines || [])),
                            foldMode: edge.foldMode || 'horizontal',
                            customFold: (edge.customFold !== undefined && edge.customFold !== null) ? edge.customFold : null
                        };
                    } else if (fromIn || toIn) {
                        // External edge: exactly one endpoint moves with drag.
                        let lines = edge.lines;
                        if (!lines || lines.length === 0) {
                            const fn = allPositions[fromId] || (state.nodesDataSet.get(fromId) || { x: 0, y: 0 });
                            const tn = allPositions[toId] || (state.nodesDataSet.get(toId) || { x: 0, y: 0 });
                            lines = computeOrthogonalLines(fn, tn, edge.foldMode || 'horizontal');
                        }
                        _dragStartExternalEdges[edge.id] = {
                            lines: JSON.parse(JSON.stringify(lines || [])),
                            foldMode: edge.foldMode || 'horizontal',
                            customFold: (edge.customFold !== undefined && edge.customFold !== null) ? edge.customFold : null,
                            from: fromId,
                            to: toId
                        };
                    }
                });
            }
        }

        state.network.on('dragStart', function (params) {
            initDragTracking(params);
        });

        state.network.on('dragging', function (params) {
            if (!_draggedNodeIds) {
                initDragTracking(params);
            }
            if (!_draggedNodeIds || _draggedNodeIds.size === 0 || !state.edgesDataSet) {
                return;
            }

            const curPositions = state.network.getPositions();
            let curRefPos = curPositions[_dragRefNodeId];
            let refStartPos = _dragRefStartPos;
            if (!curRefPos) {
                for (const id of _draggedNodeIds) {
                    if (curPositions[id] && _dragStartPositions[id]) {
                        curRefPos = curPositions[id];
                        refStartPos = _dragStartPositions[id];
                        break;
                    }
                }
            }
            if (!curRefPos || !refStartPos) return;

            const dx = curRefPos.x - refStartPos.x;
            const dy = curRefPos.y - refStartPos.y;

            const edgeUpdates = [];

            // 1. Internal edges: translate all line segments and customFold by (dx, dy).
            // The relative wire geometry, bends, corners, and waypoints remain 100% rigid.
            for (const [edgeId, base] of Object.entries(_dragStartInternalEdges || {})) {
                const translatedLines = (base.lines || []).map(l => {
                    const p1 = l.first || l.from;
                    const p2 = l.last  || l.to;
                    return {
                        first: { x: p1.x + dx, y: p1.y + dy },
                        last:  { x: p2.x + dx, y: p2.y + dy },
                        from:  { x: p1.x + dx, y: p1.y + dy },
                        to:    { x: p2.x + dx, y: p2.y + dy }
                    };
                });

                let newCustomFold = null;
                if (base.customFold !== null && base.customFold !== undefined) {
                    newCustomFold = (base.foldMode === 'vertical') ? (base.customFold + dy) : (base.customFold + dx);
                }

                edgeUpdates.push({
                    id: edgeId,
                    lines: translatedLines,
                    customFold: newCustomFold
                });
            }

            // 2. External edges: adapt the moving endpoint preserving stationary end
            for (const [edgeId, base] of Object.entries(_dragStartExternalEdges || {})) {
                const fn = curPositions[base.from] || { x: 0, y: 0 };
                const tn = curPositions[base.to] || { x: 0, y: 0 };
                const updatedLines = updateEdgeEndpoints(base, fn, tn);
                edgeUpdates.push({
                    id: edgeId,
                    lines: updatedLines
                });
            }

            if (edgeUpdates.length > 0) {
                state.edgesDataSet.update(edgeUpdates);
            }
        });

        state.network.on('dragEnd', function (params) {
            if (!_draggedNodeIds) {
                initDragTracking(params);
            }
            if (!_draggedNodeIds || _draggedNodeIds.size === 0) {
                return;
            }

            const curPositions = state.network.getPositions();
            let curRefPos = curPositions[_dragRefNodeId];
            let refStartPos = _dragRefStartPos;
            if (!curRefPos) {
                for (const id of _draggedNodeIds) {
                    if (curPositions[id] && _dragStartPositions[id]) {
                        curRefPos = curPositions[id];
                        refStartPos = _dragStartPositions[id];
                        break;
                    }
                }
            }

            let snappedDx = 0;
            let snappedDy = 0;
            if (curRefPos && refStartPos) {
                const snappedRef = snapToGrid(curRefPos.x, curRefPos.y);
                snappedDx = snappedRef.x - refStartPos.x;
                snappedDy = snappedRef.y - refStartPos.y;
            }

            // Remember currently selected nodes & edges before updates
            const selectedNodesBefore = (state.network.getSelectedNodes() || []).map(String);
            const selectedEdgesBefore = (state.network.getSelectedEdges() || []).map(String);

            // 1. Snap all dragged nodes to grid maintaining relative offsets
            const nodeUpdates = [];
            _draggedNodeIds.forEach(nodeId => {
                const startPos = _dragStartPositions[nodeId];
                const finalX = (startPos ? startPos.x : 0) + snappedDx;
                const finalY = (startPos ? startPos.y : 0) + snappedDy;
                nodeUpdates.push({ id: nodeId, x: finalX, y: finalY });
            });

            if (nodeUpdates.length > 0 && state.nodesDataSet) {
                state.nodesDataSet.update(nodeUpdates);
            }

            // 2. Finalize and persist internal edges (shape 100% preserved)
            const edgeUpdates = [];
            for (const [edgeId, base] of Object.entries(_dragStartInternalEdges || {})) {
                const finalLines = (base.lines || []).map(l => {
                    const p1 = l.first || l.from;
                    const p2 = l.last  || l.to;
                    return {
                        first: { x: p1.x + snappedDx, y: p1.y + snappedDy },
                        last:  { x: p2.x + snappedDx, y: p2.y + snappedDy },
                        from:  { x: p1.x + snappedDx, y: p1.y + snappedDy },
                        to:    { x: p2.x + snappedDx, y: p2.y + snappedDy }
                    };
                });

                let finalCustomFold = null;
                if (base.customFold !== null && base.customFold !== undefined) {
                    finalCustomFold = (base.foldMode === 'vertical') ? (base.customFold + snappedDy) : (base.customFold + snappedDx);
                }

                edgeUpdates.push({
                    id: edgeId,
                    lines: finalLines,
                    customFold: finalCustomFold
                });
            }

            // 3. Finalize and persist external edges
            for (const [edgeId, base] of Object.entries(_dragStartExternalEdges || {})) {
                const fn = _draggedNodeIds.has(base.from)
                    ? { x: _dragStartPositions[base.from].x + snappedDx, y: _dragStartPositions[base.from].y + snappedDy }
                    : (curPositions[base.from] || { x: 0, y: 0 });
                const tn = _draggedNodeIds.has(base.to)
                    ? { x: _dragStartPositions[base.to].x + snappedDx, y: _dragStartPositions[base.to].y + snappedDy }
                    : (curPositions[base.to] || { x: 0, y: 0 });

                const finalLines = updateEdgeEndpoints(base, fn, tn);
                edgeUpdates.push({
                    id: edgeId,
                    lines: finalLines
                });
            }

            if (edgeUpdates.length > 0 && state.edgesDataSet) {
                state.edgesDataSet.update(edgeUpdates);
            }

            // Persist to server
            if (nodeUpdates.length > 0) {
                api.moveNodes(nodeUpdates).catch(err => {
                    console.error('Failed to batch move nodes, falling back to individual moves:', err);
                    nodeUpdates.forEach(n => api.moveNode(n.id, n.x, n.y, false).catch(console.error));
                });
            }

            if (edgeUpdates.length > 0) {
                api.updateEdges(edgeUpdates.map(e => ({ id: e.id, lines: e.lines }))).catch(err => {
                    console.error('Failed to batch update edges, falling back to individual updates:', err);
                    edgeUpdates.forEach(e => api.updateEdge(e.id, e.lines).catch(console.error));
                });
            }

            // Clean up drag tracking state
            _dragStartPositions = null;
            _dragStartInternalEdges = null;
            _dragStartExternalEdges = null;
            _draggedNodeIds = null;
            _dragRefNodeId = null;
            _dragRefStartPos = null;

            // Restore selection of blocks and edges so they remain selected
            if (selectedNodesBefore.length > 0 || selectedEdgesBefore.length > 0) {
                state.network.setSelection({
                    nodes: selectedNodesBefore,
                    edges: selectedEdgesBefore
                });
            }

            state.network.redraw();
        });

        state.network.on('click', function (params) {
            if (state.currentMode === 'move' || state.currentMode === 'select') {
                if (!params.nodes || params.nodes.length === 0) {
                    let edgeId = (params.edges && params.edges.length > 0) ? params.edges[0] : null;
                    if (!edgeId && params.pointer && params.pointer.canvas) {
                        edgeId = getEdgeAtCanvasPos(params.pointer.canvas, 14);
                    }
                    if (edgeId) {
                        state.network.setSelection({ nodes: [], edges: [String(edgeId)] });
                        state.network.redraw();
                    }
                }
            }
        });

        state.network.on('doubleClick', function (params) {
            if (params.nodes && params.nodes.length === 1) {
                openEditNodeModal(params.nodes[0]);
            } else {
                let edgeId = (params.edges && params.edges.length === 1) ? params.edges[0] : null;
                if (!edgeId && params.pointer && params.pointer.canvas) {
                    edgeId = getEdgeAtCanvasPos(params.pointer.canvas, 14);
                }
                if (edgeId) {
                    // Double-clicking an edge inverts its fold orientation (H ⇄ V)
                    invertEdgeFold(edgeId);
                }
            }
        });

        state.network.on('select', updateClipboardUI);
        state.network.on('deselectNode', updateClipboardUI);
        state.network.on('deselectEdge', updateClipboardUI);
        updateClipboardUI();
    } catch (err) {
        console.error('Failed to load graph:', err);
    }
}

export async function createBlock(label, posX, posY) {
    try {
        const baseType = label;
        const defaultParams = LAYER_SCHEMAS[baseType] ? getDefaultParams(baseType) : {};

        // Snap placement position to nearest grid point
        const { x: snappedX, y: snappedY } = snapToGrid(posX, posY);

        const newNode = await api.addNode(baseType, baseType, snappedX, snappedY);
        const displayName = getNodeDisplayName(newNode);

        const nodeObj = {
            id:        String(newNode.id),
            label:     displayName,
            title:     displayName,
            layerType: baseType,
            params:    defaultParams,
            shape:     'box',
            x:         (typeof newNode.x === 'number' && !isNaN(newNode.x)) ? newNode.x : snappedX,
            y:         (typeof newNode.y === 'number' && !isNaN(newNode.y)) ? newNode.y : snappedY
        };

        if (state.nodesDataSet) {
            state.nodesDataSet.update(nodeObj);
        }
        return nodeObj;
    } catch (err) {
        console.error('Error adding block:', err);
        alert('Error adding block: ' + err.message);
    }
}

export function fitView() {
    if (state.network) {
        state.network.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
    }
}

export async function clearGraph() {
    if (!confirm('Clear the entire canvas? This cannot be undone.')) return;
    try {
        cancelWireCreation();
        await api.clearGraph();
        if (state.nodesDataSet) state.nodesDataSet.clear();
        if (state.edgesDataSet) state.edgesDataSet.clear();
        if (state.network) {
            state.network.unselectAll();
            state.network.redraw();
        }
        updateClipboardUI();
    } catch (e) {
        console.error('Failed to clear graph:', e);
        loadGraph();
    }
}
