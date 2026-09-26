import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const script = readFileSync(fileURLToPath(new URL('./editor.js', import.meta.url)), 'utf8');
const docs = new Map([['p1', { projectId: 'p1', projectName: 'Model 1', path: 'model.py', source: 'saved', savedSource: 'saved', hash: 'hash', replaceRequired: false }]]);
let current = 'p1', confirms = 0, assigned = '', savedRequest, compiledRequest;

function editor() {
    const elements = new Map();
    const el = id => {
        if (!elements.has(id)) elements.set(id, {
            value: '', textContent: '', scrollTop: 0, scrollLeft: 0, selectionStart: 0, selectionEnd: 0,
            style: {}, offsetHeight: 400, clientHeight: 390,
            classList: { toggle() {} }, listeners: {}, options: [],
            addEventListener(name, fn) { this.listeners[name] = fn; },
            setAttribute(name, value) { this[name] = value; },
            replaceChildren(...items) { this.options = items; }, add(item) { this.options.push(item); }, focus() {},
            setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
            setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.setSelectionRange(start + text.length, start + text.length); }
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
            if (url === '/api/projects') return { current, projects: [...docs.values()].map(doc => ({ id: doc.projectId, name: doc.projectName })) };
            if (url.startsWith('/api/projects/switch?id=')) { current = decodeURIComponent(url.split('=')[1]); return {}; }
            if (url === '/api/code/active/bind') {
                const { path } = JSON.parse(options.body);
                current = path === 'model.py' ? 'p1' : 'p2';
                if (!docs.has(current)) docs.set(current, { projectId: current, projectName: 'Model 2', path, source: 'other saved', savedSource: 'other saved', hash: 'hash2', replaceRequired: false });
                return { projectId: current };
            }
            if (url === '/api/code/files') return { files: ['model.py', 'other.py'] };
            if (url === '/api/runtime/python') return { available: true };
            if (url.startsWith('/api/code/file?')) return { path: decodeURIComponent(url.split('=')[1]) };
            if (url === '/api/code/file' && options.method === 'PUT') { savedRequest = JSON.parse(options.body); return { hash: 'saved-hash' }; }
            if (url === '/api/code/classes') return { classes: ['Model'] };
            if (url === '/api/code/compile') { compiledRequest = JSON.parse(options.body); return { projectId: current, nodeCount: 2, edgeCount: 1 }; }
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
second.el('codeSource').value = 'edited again';
await second.context.switchProject('p2');
assert.equal(current, 'p2', 'Code changes the shared active model');
assert.equal(docs.get('p1').source, 'edited again', 'switching saves the previous model draft');
assert.equal(second.el('codeSource').value, 'other saved');
assert.equal(second.el('codeProjectList').options[1]['aria-current'], 'true');
await second.context.switchProject('p1');
assert.equal(second.el('codeSource').value, 'edited again', 'switching back restores the draft');
const highlight = second.context.highlightPython;
assert.equal(highlight('return 1.5e-3 # True'), '<span class="code-keyword">return</span> <span class="code-number">1.5e-3</span> <span class="code-comment"># True</span>');
for (const value of ['"if # 2"', "'''first\nreturn 42\nlast'''", '"""unfinished\nclass', 'r"unfinished', 'f"value: {1}"', '"escaped \\" quote"']) {
    assert.equal(highlight(value), `<span class="code-string">${value}</span>`);
}
assert.equal(highlight('"open\nreturn'), '<span class="code-string">"open</span>\n<span class="code-keyword">return</span>');
assert.equal(highlight('different return_value café2'), 'different return_value café2');
for (const number of ['0xff', '0b_1', '0o77', '1_000', '.5', '2j']) {
    assert.equal(highlight(number), `<span class="code-number">${number}</span>`);
}
const sample = 'class Model:\n\tvalue = "<script>&amp;</script>" # <>&\n\n';
const markup = highlight(sample);
assert.ok(!markup.includes('<script>'));
assert.equal(markup.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), sample);
const input = second.el('codeSource');
input.value = sample;
input.listeners.input();
assert.equal(second.el('codeHighlightText').innerHTML, markup + '\u200b');
assert.equal(input.value, sample);
input.scrollTop = 100; input.scrollLeft = 70; input.listeners.scroll();
assert.equal(second.el('codeHighlight').scrollTop, 100);
assert.equal(second.el('codeHighlight').scrollLeft, 70);
assert.equal(second.el('lineNumbers').scrollTop, 100);
assert.equal(second.el('lineNumbers').style.paddingBottom, '22px');
input.setSelectionRange(0, 0);
input.listeners.keydown({ key: 'Tab', preventDefault() {} });
assert.equal(input.value, '    ' + sample);
assert.equal(second.el('codeHighlightText').innerHTML, '    ' + markup + '\u200b');
second.el('searchCode').value = 'value';
second.el('findNext').listeners.click();
assert.equal(input.value.slice(input.selectionStart, input.selectionEnd), 'value');
await second.context.save();
assert.equal(savedRequest.source, input.value);
input.value += '# unsaved\n'; input.listeners.input();
await second.context.compile();
assert.equal(compiledRequest.source, input.value);
assert.equal(docs.get('p1').source, input.value);
assert.equal(assigned, '/canvas');
await second.context.loadActive();
assert.equal(second.el('codeHighlightText').innerHTML, highlight(input.value) + '\u200b');
console.log('Code highlighting, save, compile, active-project and draft checks passed');
