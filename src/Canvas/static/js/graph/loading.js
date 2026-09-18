import { prepareNodes, prepareEdges } from './data.js';
import { createNetworkOptions } from './options.js';
import { state } from '../state.js';
import { api } from '../api.js';

import { setMode } from '../modes.js';
import { setupCircuitCanvas } from '../circuit.js';
import { setupNodeDragging } from './dragging.js';
import { setupGraphSelection } from './selection.js';
let loadVersion = 0;

export async function loadGraph({ projectId = null } = {}) {
    const version = ++loadVersion;
    try {
        const data = await api.fetchGraphData({ analyze: false, projectId });
        if (version !== loadVersion) return;
        const container = document.getElementById('mynetwork');
        if (!container) return;

        const processedNodes = prepareNodes(data);

        const processedEdges = prepareEdges(data, processedNodes);

        state.nodesDataSet = new vis.DataSet(processedNodes);
        state.edgesDataSet = new vis.DataSet(processedEdges);
        state.currentProjectId = data.projectId;

        if (data.name) {
            const titleEl = document.getElementById('modelTitle');
            if (titleEl) titleEl.textContent = data.name;
            document.title = data.name + ' – Neural Network Builder';
        }

        const graphData = { nodes: state.nodesDataSet, edges: state.edgesDataSet };

        const options = createNetworkOptions();

        if (state.network) state.network.destroy();
        state.network = new vis.Network(container, graphData, options);
        setMode(state.currentMode);

        // Initialise PCB-style grid background and orthogonal edge rendering
        setupCircuitCanvas();

        setupNodeDragging();

        setupGraphSelection();
        void api.refreshShapes();
    } catch (err) {
        console.error('Failed to load graph:', err);
    }
}
