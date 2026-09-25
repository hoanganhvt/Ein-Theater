import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const script = readFileSync(fileURLToPath(new URL('./editor.js', import.meta.url)), 'utf8');
const docs = new Map([['p1', { projectId: 'p1', projectName: 'Model 1', path: 'model.py', source: 'saved', savedSource: 'saved', hash: 'hash', replaceRequired: false }]]);
let current = 'p1', confirms = 0, assigned = '';

function editor() {
    const elements = new Map();
    const el = id => {
        if (!elements.has(id)) elements.set(id, {
            value: '', textContent: '', scrollTop: 0, selectionEnd: 0,
            classList: { toggle() {} }, listeners: {}, options: [],
            addEventListener(name, fn) { this.listeners[name] = fn; },
            replaceChildren(...items) { this.options = items; }, add(item) { this.options.push(item); }, focus() {}
        });
        return elements.get(id);
    };
    const events = {};
    const window = { location: { assign: url => { assigned = url; } }, addEventListener: (name, fn) => { events[name] = fn; } };
    const context = vm.createContext({
        document: { getElementById: el, createElement: () => el(Symbol()), title: '' }, window,
        fetch: async (url, options = {}) => ({ ok: true, json: async () => {
            if (url === '/api/code/active' && options.method === 'PUT') {
                const update = JSON.parse(options.body);
                assert.equal(update.projectId, current);
                Object.assign(docs.get(current), update);
                return { synced: true };
            }
            if (url === '/api/code/active') return { ...docs.get(current) };
            if (url === '/api/code/active/bind') {
                const { path } = JSON.parse(options.body);
                current = path === 'model.py' ? 'p1' : 'p2';
                if (!docs.has(current)) docs.set(current, { projectId: current, projectName: 'Model 2', path, source: 'other saved', savedSource: 'other saved', hash: 'hash2', replaceRequired: false });
                return { projectId: current };
            }
            if (url === '/api/code/files') return { files: ['model.py', 'other.py'] };
            if (url === '/api/runtime/python') return { available: true };
            if (url.startsWith('/api/code/file?')) return { path: decodeURIComponent(url.split('=')[1]) };
            if (url === '/api/code/classes') return { classes: ['Model'] };
            if (url === '/api/code/compile') return { projectId: current, nodeCount: 2, edgeCount: 1 };
            return {};
        } }),
        confirm: () => { confirms++; return true; }, prompt: () => null,
        Option: class { constructor(text, value) { this.text = text; this.value = value; } },
        setTimeout, clearTimeout
    });
    vm.runInContext(script, context);
    return { context, el, window, events };
}

const first = editor();
await new Promise(resolve => setImmediate(resolve));
assert.equal(first.el('codeSource').value, 'saved');
first.el('codeSource').value = 'edited';
await first.context.openFile('model.py');
assert.equal(confirms, 0);
await first.el('newFile').listeners.click();
assert.equal(confirms, 0, 'cancelled New File does not ask to discard');
first.el('codeSource').value = 'saved';
let warned = false;
first.events.beforeunload({ preventDefault() { warned = true; } });
assert.equal(warned, false, 'reverted edits are clean');

first.el('codeSource').value = 'edited';
await first.window.prepareModeSwitch('canvas');
assert.equal(docs.get('p1').source, 'edited');
first.events.beforeunload({ preventDefault() { warned = true; } });
assert.equal(warned, false, 'mode switch preserves the draft');

const second = editor();
await new Promise(resolve => setImmediate(resolve));
assert.equal(second.el('codeSource').value, 'edited', 'Code restores the active project draft');
warned = false;
second.events.beforeunload({ preventDefault() { warned = true; } });
assert.equal(warned, true, 'unrelated navigation warns about unsaved edits');
await second.context.openFile('other.py');
assert.equal(second.el('codeSource').value, 'other saved');
assert.equal(confirms, 0, 'switching files preserves each project draft');
await second.context.openFile('model.py');
assert.equal(second.el('codeSource').value, 'edited');
assert.equal(current, 'p1');
console.log('Code active-project and draft checks passed');
