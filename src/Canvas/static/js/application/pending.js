import { api } from '../api.js';

const pending = new Set();
let installed = false;

export function trackCanvasEdits() {
    if (installed) return;
    installed = true;
    for (const name of [
        'addNode', 'updateNode', 'deleteNode', 'deleteNodes', 'moveNode', 'moveNodes',
        'addEdge', 'updateEdge', 'updateEdges', 'deleteEdge', 'pasteGraph',
        'clearGraph', 'dragSelection', 'deleteSelection', 'saveModel', 'loadModel'
    ]) {
        const original = api[name];
        if (!original) continue;
        api[name] = function (...args) {
            const promise = Promise.resolve().then(() => original.apply(this, args));
            pending.add(promise);
            promise.finally(() => pending.delete(promise)).catch(() => {});
            return promise;
        };
    }
    window.waitForCanvasEdits = async () => {
        while (pending.size) {
            const results = await Promise.allSettled([...pending]);
            const failure = results.find(result => result.status === 'rejected');
            if (failure) throw failure.reason;
        }
    };
}
