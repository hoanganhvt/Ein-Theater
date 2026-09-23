import assert from 'node:assert/strict';

const events = {};
let folderOpens = 0;
const window = globalThis.window = { chooseWorkspace: () => { folderOpens++; }, refreshHistory() {}, updateClipboardUI() {} };

function menu() {
    const classes = new Set();
    const attrs = {};
    const button = { setAttribute: (key, value) => attrs[key] = value, focus() { document.activeElement = button; } };
    const content = { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } };
    const wrapper = { querySelector: selector => selector === '.menu-btn' ? button : content, querySelectorAll: () => [], contains: target => target === wrapper || target === button, attrs, classes, button };
    button.closest = () => wrapper;
    return wrapper;
}
const file = menu(), edit = menu(), mode = menu();
const bar = { addEventListener: (name, fn) => events['bar:' + name] = fn, querySelectorAll: () => [file, edit, mode], contains: target => [file, edit, mode].some(item => item.contains(target)) };
const document = globalThis.document = { activeElement: null, getElementById: () => bar, addEventListener: (name, fn) => events[name] = fn };
await import('./menubar.js');

events['bar:click']({ target: { closest: selector => selector === '.menu-btn' ? file.button : null } });
assert.equal(file.attrs['aria-expanded'], 'true');
assert.ok(file.classes.has('open'));
events['bar:click']({ target: { closest: selector => selector === '.menu-btn' ? edit.button : null } });
assert.equal(file.attrs['aria-expanded'], 'false');
assert.equal(edit.attrs['aria-expanded'], 'true');
events.keydown({ key: 'Escape', preventDefault() {} });
assert.equal(edit.attrs['aria-expanded'], 'false');
assert.equal(document.activeElement, edit.button);
events['bar:click']({ target: { closest: selector => selector === '.menu-btn' ? file.button : null } });
events['bar:click']({ target: { closest: selector => selector === '.menu-btn' ? null : { disabled: false, dataset: { command: 'open-folder' } } } });
assert.equal(folderOpens, 1);
assert.equal(file.attrs['aria-expanded'], 'false');
console.log('Studio menubar interaction passed');
