import assert from 'node:assert/strict';
import { state } from './state.js';
import { attachShapeRefresh } from './api/shapeRefresh.js';
import { drawGrid } from './circuit/drawing.js';
import { runtime } from './circuit/runtime.js';
import { setupPaletteDragAndDrop } from './palette/dragging.js';
import { loadGraph } from './graph/loading.js';
import { api as applicationApi } from './api.js';

const deferred = () => {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const nodes = new Map([['n0', { id: 'n0', x: 50, params: {} }]]);
state.nodesDataSet = {
    get: id => nodes.get(id),
    update: updates => updates.forEach(n => nodes.set(n.id, { ...nodes.get(n.id), ...n }))
};
state.currentProjectId = 'p0';
const api = {};
for (const method of ['addNode', 'updateNode', 'deleteNode', 'deleteNodes', 'addEdge', 'deleteEdge', 'pasteGraph', 'clearGraph', 'saveModel']) {
    api[method] = async () => ({ id: 'n0' });
}
let calls = 0;
let response = deferred(), started = deferred();
api.fetchGraphData = async options => {
    assert.equal(options.projectId, 'p0');
    ++calls;
    started.resolve();
    return response.promise;
};
attachShapeRefresh(api);

// A burst acknowledges all writes while shape analysis is still unresolved.
await Promise.race([
    Promise.all(Array.from({ length: 20 }, () => api.addNode())),
    delay(500).then(() => { throw Error('canvas mutation waited for shape analysis'); })
]);
const flushed = api.refreshShapes();
await started.promise;
assert.equal(calls, 1, 'one analysis per burst');
response.resolve({ projectId: 'p0', nodes: [{ id: 'n0', params: { in_features: 32 } }] });
await flushed;
assert.equal(nodes.get('n0').params.in_features, 32);
assert.equal(nodes.get('n0').x, 50, 'background refresh must preserve layout');

// A new edit invalidates an already-running response, with one follow-up only.
response = deferred(); started = deferred();
const oldResponse = response;
const stale = api.refreshShapes();
await started.promise;
await api.updateNode();
response = deferred(); started = deferred();
oldResponse.resolve({ projectId: 'p0', nodes: [{ id: 'n0', params: { in_features: 999 } }] });
await started.promise;
assert.equal(nodes.get('n0').params.in_features, 32, 'stale inference overwrote a newer edit');
response.resolve({ projectId: 'p0', nodes: [{ id: 'n0', params: { in_features: 64 } }] });
await stale;
assert.equal(nodes.get('n0').params.in_features, 64);
assert.equal(calls, 3);

// Switching projects while an analysis runs must never touch the new dataset.
response = deferred(); started = deferred();
const switched = api.refreshShapes();
await started.promise;
state.nodesDataSet = { get() { throw Error('old analysis read new dataset'); }, update() { throw Error('old analysis updated new dataset'); } };
state.currentProjectId = 'p1';
response.resolve({ projectId: 'p0', nodes: [{ id: 'n0', params: {} }] });
await switched;

// Grid work remains bounded even after fitting a very large graph.
runtime.container = { clientWidth: 1600, clientHeight: 900 };
for (const scale of [1, 0.1, 0.02, 0.001]) {
    state.network = { getScale: () => scale, getViewPosition: () => ({ x: 0, y: 0 }) };
    let dots = 0, fills = 0;
    drawGrid({ save() {}, restore() {}, fillRect() {}, beginPath() {}, moveTo() {}, arc() { dots++; }, fill() { fills++; } });
    assert.ok(dots < 15000, `grid generated ${dots} dots at scale ${scale}`);
    assert.equal(fills, 1, 'batch the dots into one fill');
    if (scale === 0.02) console.log(`Grid at 2% zoom: ${dots} dots/frame (was 1452525).`);
}

// Rendering and sidebar bootstrap can both call setup; each item binds once.
const counts = {};
const item = { addEventListener(name) { counts[name] = (counts[name] || 0) + 1; } };
const container = { style: {}, addEventListener() {} };
globalThis.document = {
    getElementById: id => id === 'mynetwork' ? container : null,
    querySelectorAll: () => [item], addEventListener() {}
};
globalThis.window = { addEventListener() {} };
setupPaletteDragAndDrop();
setupPaletteDragAndDrop();
assert.deepEqual(counts, { dragstart: 1, dragend: 1, click: 1 });

// Loading displays the snapshot before asking for background analysis.
state.network = null;
let requestedAnalysis = false;
applicationApi.fetchGraphData = async options => {
    assert.equal(options.analyze, false);
    return { projectId: 'loaded', nodes: [], edges: [] };
};
applicationApi.refreshShapes = () => {
    assert.ok(state.network, 'analysis requested before the canvas exists');
    requestedAnalysis = true;
    return new Promise(() => {}); // Simulate an indefinitely busy Python worker.
};
globalThis.vis = {
    DataSet: class { constructor(items) { this.items = items; } get() { return this.items; } },
    Network: class {
        on() {} redraw() {} disableEditMode() {} setOptions() {}
        getSelectedNodes() { return []; } getSelectedEdges() { return []; }
    }
};
await loadGraph();
assert.ok(requestedAnalysis);
assert.equal(state.currentProjectId, 'loaded');
console.log('Nonblocking graph load/mutations, coalescing, stale-response guards and palette binding checks passed.');
