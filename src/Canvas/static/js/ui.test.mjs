import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { state } from './state.js';
import { BEND_MODES, computeEdgeLines, updateEdgeEndpoints, snapToGrid, cancelWireCreation, addWireWaypoint } from './circuit.js';
import { runtime } from './circuit/runtime.js';
import { nodesInRectangle } from './selection/hitTest.js';
import { prepareNodes, prepareEdges } from './graph/data.js';
import { setupNodeDragging } from './graph/dragging.js';
import { api } from './api.js';

globalThis.window = {};
globalThis.document = { getElementById: () => null };
await import('./application/handlers.js');

// Exercise the full module graph, including every compatibility entry point.
async function checkModules(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
        if (entry.isDirectory()) await checkModules(url);
        else if (entry.name.endsWith('.js')) {
            await import(url);
            const code = await readFile(url, 'utf8');
            for (const [, relative] of code.matchAll(/import\(['"]([^'"]+)['"]\)/g)) {
                await import(new URL(relative, url));
            }
        }
    }
}
await checkModules(new URL('./', import.meta.url));

// The studio template already references two unimplemented connection-type
// controls. Keep that existing discrepancy explicit; do not expand this refactor
// into a change to graph semantics. Every other handler must remain public.
const legacyUnimplementedHandlers = new Set(['setSelectedEdgeType', 'selectModalEdgeType']);
async function checkHandlers(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
        if (entry.isDirectory()) await checkHandlers(url);
        else if (entry.name.endsWith('.html')) {
            const html = await readFile(url, 'utf8');
            for (const [, handler] of html.matchAll(/\bon\w+="([^"]*)"/g)) {
                for (const [, name] of handler.matchAll(/(?<![.\w])([a-zA-Z_$][\w$]*)\(/g)) {
                    if (['if', 'alert', 'setTimeout'].includes(name)) continue;
                    if (legacyUnimplementedHandlers.has(name)) continue;
                    assert.equal(typeof window[name], 'function', `${fileURLToPath(url)}: missing ${name}`);
                }
            }
        }
    }
}
await checkHandlers(new URL('../../templates/', import.meta.url));
await checkHandlers(new URL('../../../templates/', import.meta.url));

assert.deepEqual(snapToGrid(72, -76), { x: 50, y: -100 });
for (const mode of BEND_MODES) {
    const start = { x: 0, y: 0 }, end = { x: 300, y: 200 };
    const lines = computeEdgeLines(start, end, mode);
    assert.deepEqual(lines[0].first, start);
    assert.deepEqual(lines.at(-1).last, end);
    for (const line of lines) assert.ok(line.first.x === line.last.x || line.first.y === line.last.y);
    const moved = updateEdgeEndpoints({ lines, foldMode: mode }, { x: 50, y: 50 }, { x: 400, y: 300 });
    assert.deepEqual(moved[0].first, { x: 50, y: 50 });
    assert.deepEqual(moved.at(-1).last, { x: 400, y: 300 });
}

state.network = {
    getPositions: () => ({ a: { x: 100, y: 100 }, b: { x: 5, y: 5 }, c: { x: 500, y: 500 } }),
    DOMtoCanvas: p => ({ x: p.x * 2, y: p.y * 2 }),
    canvasToDOM: p => ({ x: p.x / 2, y: p.y / 2 }),
    getBoundingBox: id => { if (id === 'b') throw Error('not measured'); return id === 'a' ? { left: 10, right: 100, top: 10, bottom: 100 } : { left: 490, right: 510, top: 490, bottom: 510 }; },
    redraw() {}
};
assert.deepEqual(nodesInRectangle(0, 0, 20, 20), ['a', 'b']);
runtime.wireStartNode = 'a';
runtime.wireWaypoints = [{ x: 0, y: 0 }];
addWireWaypoint({ x: 100, y: 100 });
assert.ok(runtime.wireWaypoints.length > 1);
cancelWireCreation();
assert.equal(runtime.wireStartNode, null);
assert.deepEqual(runtime.wireWaypoints, []);

const data = { nodes: [{ id: 'linear_0', layerType: 'nn.Linear', x: 0, y: 0 }, { id: 'linear_1', layerType: 'nn.Linear', x: 200, y: 100 }], edges: [{ id: 'e0', from: 'linear_0', to: 'linear_1' }] };
const nodes = prepareNodes(data), edges = prepareEdges(data, nodes);
assert.equal(nodes[0].label, 'linear 0');
assert.ok(edges[0].lines.length);
assert.equal(edges[0].color.opacity, 0);

// Simulate a group drag across the extracted registration boundary: internal
// wire bends must translate rigidly and be persisted with snapped positions.
const handlers = {}, positions = Object.fromEntries(nodes.map(n => [n.id, { x: n.x, y: n.y }]));
const edgeMap = new Map(edges.map(e => [e.id, e]));
const initialLines = structuredClone(edges[0].lines);
const persisted = {};
state.nodesDataSet = { get: id => nodes.find(n => n.id === id), update: items => items.forEach(n => Object.assign(nodes.find(x => x.id === n.id), n)) };
state.edgesDataSet = { get: id => id ? edgeMap.get(id) : [...edgeMap.values()], update: items => items.forEach(e => Object.assign(edgeMap.get(e.id), e)) };
state.network = {
    on: (name, fn) => { handlers[name] = fn; },
    getSelectedNodes: () => nodes.map(n => n.id), getSelectedEdges: () => ['e0'],
    getPositions: () => structuredClone(positions),
    moveNode: (id, x, y) => { positions[id] = { x, y }; },
    setSelection() {}, redraw() {}
};
api.dragSelection = async (nodes, edges) => { persisted.nodes = nodes; persisted.edges = edges; };
setupNodeDragging();
handlers.dragStart({ nodes: ['linear_0'] });
for (const pos of Object.values(positions)) { pos.x += 73; pos.y += 26; }
handlers.dragging({ nodes: ['linear_0'] });
handlers.dragEnd({ nodes: ['linear_0'] });
assert.equal(persisted.nodes[0].x, 50);
assert.equal(persisted.nodes[0].y, 50);
assert.deepEqual(persisted.edges[0].lines, initialLines.map(l => Object.fromEntries(Object.entries(l).map(([key, p]) => [key, { x: p.x + 50, y: p.y + 50 }]))));
console.log('UI modules, inline handlers, routing geometry, selection, wiring and group dragging checks passed.');
