import assert from 'node:assert/strict';
import { api, tensorSummary, integratedShapeLabel } from './api.js';
import { state } from './state.js';

const local = new Map([['linear_0', { id: 'linear_0', x: 150, params: { in_features: 128 } }]]);
state.nodesDataSet = {
    get(id) { return local.get(id); },
    update(nodes) { for (const node of nodes) local.set(node.id, { ...local.get(node.id), ...node }); }
};
let nodes = [{ id: 'linear_0', layerType: 'nn.Linear', params: { in_features: 1568, out_features: 10 }, tensorInfo: { input: [2, 1568], output: [2, 10], auto: ['in_features'], message: '' } }];
const calls = [];
globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ nodes }), text: async () => '' };
};
await api.updateNode({ id: 'input_0', params: { shape_preset: '1, 28, 28' } });
assert.equal(calls[0].url, '/api/updateNode');
assert.equal(calls[1].url, '/api/data');
assert.equal(local.get('linear_0').params.in_features, 1568);
assert.equal(local.get('linear_0').x, 150);
assert.match(local.get('linear_0').title, /in_features=1568/);
nodes[0].tensorInfo = { input: null, output: null, auto: null, message: 'Connect an Input block to infer dimensions.' };
await api.deleteEdge('e0');
assert.equal(local.get('linear_0').tensorInfo.output, null);
assert.match(tensorSummary(local.get('linear_0')), /Connect an Input/);

const integrated = { id: 'model_0', layerType: 'IntegratedModel', params: { model_name: 'Encoder', inputs: [{name: 'x', shape: [2, 8]}], outputs: [{name:'y', shape:[2, 3]}] }, tensorInfo: { input:[2,8], output:[2,3], auto:['inputs'] }, adaptedModel: { name:'Encoder', nodes:[] } };
local.set(integrated.id, { ...integrated, x: 200 });
nodes = [integrated];
await api.addEdge('input_0', integrated.id);
assert.match(local.get(integrated.id).label, /IN: x \[2, 8\]/);
assert.match(integratedShapeLabel(integrated), /save to create copy/);
assert.match(tensorSummary(integrated), /Adapted recursively/);
delete integrated.adaptedModel;
await api.deleteEdge('e0');
assert.equal(local.get(integrated.id).adaptedModel, null);

// A response from a previous canvas must never update a newly selected project.
const original = state.nodesDataSet;
globalThis.fetch = async (url) => {
    if (url === '/api/data') state.nodesDataSet = { update() { throw new Error('Stale project update'); } };
    return { ok: true, json: async () => ({ nodes }) };
};
await api.updateNode({ id: 'input_0' });
assert.notEqual(state.nodesDataSet, original);
console.log('API dimension refresh checks passed.');
