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

        if (data.name) {
            const titleEl = document.getElementById('modelTitle');
            if (titleEl) titleEl.textContent = data.name;
            document.title = data.name + ' – Neural Network Builder';
        }

        const graphData = { nodes: state.nodesDataSet, edges: state.edgesDataSet };

        const options = createNetworkOptions();

        if (state.network && state.currentProjectId) {
            try { localStorage.setItem('ein_view_' + state.currentProjectId, JSON.stringify({ position: state.network.getViewPosition(), scale: state.network.getScale() })); } catch (_) {}
        }
        state.currentProjectId = data.projectId;
        if (state.network) state.network.destroy();
        state.network = new vis.Network(container, graphData, options);
        try {
            const saved = JSON.parse(localStorage.getItem('ein_view_' + data.projectId) || 'null');
            if (saved?.position && Number.isFinite(saved.scale)) state.network.moveTo({ position: saved.position, scale: saved.scale, animation: false });
        } catch (_) {}
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
