// ── Vis.js Canvas & Network Graph Core ────────────────────────────
import { state } from './state.js';
import { api } from './api.js';
import { LAYER_SCHEMAS, getDefaultParams, formatNodeLabel, getNodeDisplayName } from './schemas.js';
import { setMode } from './modes.js';
import { openAddNodeModal, openEditNodeModal } from './modals.js';
import { setupCircuitCanvas, snapToGrid, computeOrthogonalLines, computeEdgeLines, invertEdgeFold, updateEdgeEndpoints, getEdgeAtCanvasPos, cancelWireCreation } from './circuit.js';

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

        state.network.on('dragging', function (params) {
            // Live update edge lines while dragging nodes preserving intermediate user waypoints
            if (params.nodes && params.nodes.length > 0 && state.edgesDataSet) {
                const positions = state.network.getPositions();
                params.nodes.forEach(nodeId => {
                    state.edgesDataSet.get().forEach(edge => {
                        if (String(edge.from) === String(nodeId) || String(edge.to) === String(nodeId)) {
                            const fn = positions[String(edge.from)];
                            const tn = positions[String(edge.to)];
                            if (fn && tn) {
                                edge.lines = updateEdgeEndpoints(edge, fn, tn);
                                state.edgesDataSet.update(edge);
                            }
                        }
                    });
                });
            }
        });

        state.network.on('dragEnd', function (params) {
            if (params.nodes && params.nodes.length > 0) {
                params.nodes.forEach(nodeId => {
                    const raw = (state.network.getPositions([nodeId]) || {})[nodeId];
                    if (!raw) return;
                    // Snap released node to nearest grid point
                    const { x, y } = snapToGrid(raw.x, raw.y);
                    state.nodesDataSet.update({ id: nodeId, x, y });
                    api.moveNode(nodeId, x, y).catch(console.error);
                });

                // Update connected edge lines with final snapped positions preserving waypoints
                if (state.edgesDataSet) {
                    const positions = state.network.getPositions();
                    params.nodes.forEach(nodeId => {
                        state.edgesDataSet.get().forEach(edge => {
                            if (String(edge.from) === String(nodeId) || String(edge.to) === String(nodeId)) {
                                const fn = positions[String(edge.from)];
                                const tn = positions[String(edge.to)];
                                if (fn && tn) {
                                    edge.lines = updateEdgeEndpoints(edge, fn, tn);
                                    state.edgesDataSet.update(edge);
                                    api.updateEdge(edge.id, edge.lines).catch(console.error);
                                }
                            }
                        });
                    });
                }
                state.network.redraw();
            }
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
    } catch (e) {
        console.error('Failed to clear graph:', e);
        loadGraph();
    }
}
