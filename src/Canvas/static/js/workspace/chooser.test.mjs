import assert from 'node:assert/strict';

globalThis.document = { getElementById: () => null };
globalThis.window = globalThis;

const { chooseWorkspace } = await import('./chooser.js');
const { state } = await import('../state.js');

function response(ok, body, status = ok ? 200 : 400) {
    return { ok, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
}

state.workingDir = '';
let calls = [];
window.einDesktop = { selectDirectory: async () => 'C:\\Models' };
globalThis.fetch = async url => {
    calls.push(url);
    return response(true, { workingDir: 'C:\\Models', name: 'Models' });
};
let result = await chooseWorkspace();
assert.equal(result.cancelled, false);
assert.equal(state.workingDir, 'C:\\Models');
assert.equal(calls.length, 1);

calls = [];
window.einDesktop.selectDirectory = async () => null;
result = await chooseWorkspace();
assert.equal(result.cancelled, true);
assert.equal(calls.length, 0);

delete window.einDesktop;
calls = [];
globalThis.fetch = async url => {
    calls.push(url);
    if (String(url).includes('select-native')) return response(true, { cancelled: false, workingDir: 'D:\\Work' });
    return response(true, { workingDir: 'D:\\Work', name: 'Work' });
};
result = await chooseWorkspace();
assert.equal(result.workingDir, 'D:\\Work');
assert.equal(calls.length, 2);

window.einDesktop = { selectDirectory: async () => 'Z:\\Missing' };
globalThis.fetch = async () => response(false, 'Directory does not exist');
await assert.rejects(() => chooseWorkspace(), /Directory does not exist/);

console.log('Native workspace chooser checks passed');
