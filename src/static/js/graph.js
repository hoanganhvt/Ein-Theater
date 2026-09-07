// ── Vis.js Canvas & Network Graph Core ────────────────────────────
import { state } from './state.js';
import { api } from './api.js';
import { LAYER_SCHEMAS, getDefaultParams, formatNodeLabel } from './schemas.js';
import { setMode } from './modes.js';
import { openAddNodeModal, openEditNodeModal } from './modals.js';

export async function loadGraph() {
    try {
        const data = await api.fetchGraphData();
        const container = document.getElementById('mynetwork');
        if (!container) return;

        const processedNodes = (data.nodes || []).map(n => {
            const baseType = n.layerType || (n.label || '').split('\n')[0].trim();
            const params = n.params || (LAYER_SCHEMAS[baseType] ? getDefaultParams(baseType) : {});
            const label = formatNodeLabel(baseType, params);
            return {
                ...n,
                id: String(n.id),
                label: label,
                layerType: baseType,
                params: params,
                shape: n.shape || 'box'
            };
        });

        state.nodesDataSet = new vis.DataSet(processedNodes);
        state.edgesDataSet = new vis.DataSet(data.edges || []);

        if (data.name) {
            const titleEl = document.getElementById('modelTitle');
            if (titleEl) titleEl.textContent = data.name;
            document.title = data.name + ' – Neural Network Builder';
        }

        const graphData = { nodes: state.nodesDataSet, edges: state.edgesDataSet };

        const options = {
            manipulation: {
                enabled: true,
                addNode: function (nodeData, callback) {
                    openAddNodeModal(nodeData, callback);
                },
                deleteNode: function (nodeData, callback) {
                    if (nodeData.nodes) {
                        nodeData.nodes.forEach(id => api.deleteNode(id).catch(console.error));
                    }
                    if (nodeData.edges) {
                        nodeData.edges.forEach(id => api.deleteEdge(id).catch(console.error));
                    }
                    callback(nodeData);
                },
                addEdge: function (edgeData, callback) {
                    if (edgeData.from === edgeData.to) {
                        alert('Cannot connect a node to itself.');
                        callback(null);
                        if (state.currentMode === 'connect' && state.network) {
                            setTimeout(() => { if (state.currentMode === 'connect' && state.network) state.network.addEdgeMode(); }, 60);
                        }
                        return;
                    }
                    api.addEdge(edgeData.from, edgeData.to)
                        .then(e => {
                            edgeData.id = e.id;
                            callback(edgeData);
                            if (state.currentMode === 'connect' && state.network) {
                                setTimeout(() => { if (state.currentMode === 'connect' && state.network) state.network.addEdgeMode(); }, 60);
                            }
                        })
                        .catch(err => {
                            alert('Failed to add edge: ' + err.message);
                            callback(null);
                            if (state.currentMode === 'connect' && state.network) {
                                setTimeout(() => { if (state.currentMode === 'connect' && state.network) state.network.addEdgeMode(); }, 60);
                            }
                        });
                },
                deleteEdge: function (edgeData, callback) {
                    if (edgeData.edges) {
                        edgeData.edges.forEach(id => api.deleteEdge(id).catch(console.error));
                    }
                    callback(edgeData);
                },
                editNode: false,
                editEdge: false
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
                width: 2,
                color: { color: '#718096', highlight: '#007acc' },
                smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.4 },
                arrows: { to: { enabled: true, scaleFactor: 0.8 } }
            }
        };

        if (state.network) state.network.destroy();
        state.network = new vis.Network(container, graphData, options);
        setMode(state.currentMode);

        state.network.on('dragEnd', function (params) {
            if (params.nodes && params.nodes.length > 0) {
                params.nodes.forEach(nodeId => {
                    const pos = (state.network.getPositions([nodeId]) || {})[nodeId];
                    if (pos) {
                        api.moveNode(nodeId, pos.x, pos.y).catch(console.error);
                    }
                });
            }
        });

        state.network.on('doubleClick', function (params) {
            if (params.nodes && params.nodes.length === 1) {
                openEditNodeModal(params.nodes[0]);
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
        const formattedLabel = formatNodeLabel(baseType, defaultParams);

        const newNode = await api.addNode(formattedLabel, baseType, posX, posY);

        const nodeObj = {
            id:        String(newNode.id),
            label:     formattedLabel,
            layerType: baseType,
            params:    defaultParams,
            shape:     'box',
            x:         (typeof newNode.x === 'number' && !isNaN(newNode.x)) ? newNode.x : posX,
            y:         (typeof newNode.y === 'number' && !isNaN(newNode.y)) ? newNode.y : posY
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
        await api.clearGraph();
        if (state.nodesDataSet) state.nodesDataSet.clear();
        if (state.edgesDataSet) state.edgesDataSet.clear();
    } catch (e) {
        console.error('Failed to clear graph:', e);
        loadGraph();
    }
}
