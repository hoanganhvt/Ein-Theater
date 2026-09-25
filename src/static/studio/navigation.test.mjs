import assert from 'node:assert/strict';

let buttons = [], destination = null, ready, prepared = false;
globalThis.window = {
    location: { assign: url => { assert.equal(prepared, true); destination = url; } },
    prepareModeSwitch: async () => { prepared = true; }
};
globalThis.document = {
    readyState: 'loading',
    body: { dataset: { studioMode: 'canvas' } },
    addEventListener: (event, callback) => { ready = callback; },
    getElementById: () => ({ replaceChildren: (...items) => { buttons = items; } }),
    createElement: () => ({
        dataset: {}, attributes: {}, classes: {},
        classList: { toggle() {} },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(event, callback) { this.click = callback; },
    }),
};
globalThis.fetch = async url => {
    assert.equal(url, '/api/modes');
    return { ok: true, json: async () => [
        { id: 'canvas', name: 'Canvas', available: true, url: '/canvas' },
        { id: 'data', name: 'Data', available: true, url: '/data' },
        { id: 'debug', name: 'Debug', available: false },
    ] };
};
await import('./navigation.js');
await ready();
assert.equal(buttons.length, 3);
assert.equal(buttons[0].attributes['aria-current'], 'page');
buttons[0].click();
assert.equal(destination, null);
await buttons[1].click();
assert.equal(destination, '/data');
assert.equal(buttons[2].disabled, true);
assert.equal(buttons[2].click, undefined);
console.log('Studio mode navigation passed');
