const el = id => document.getElementById(id);
const source = el('codeSource');
let path = '';
let savedSource = '';
let savedHash = '';
let projectId = '';
let projectName = '';
let replaceRequired = false;
let busy = false;
let navigatingWithDraft = false;

async function syncDraft() {
    if (!projectId) return;
    await request('/api/code/active', json('PUT', {
        projectId, path, source: source.value, savedSource, hash: savedHash
    }));
}
async function loadActive() {
    const data = await request('/api/code/active');
    projectId = data.projectId;
    projectName = data.projectName || '';
    path = data.path || '';
    source.value = data.source || '';
    savedSource = data.savedSource || '';
    savedHash = data.hash || '';
    replaceRequired = !!data.replaceRequired;
    title(); await listFiles(); await scanClasses();
    status(path ? `Working on ${path} in ${projectName}` : `Working on ${projectName}. Create or open a Python file.`);
}

async function request(url, options = {}) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const dirty = () => source.value !== savedSource;
function status(message, error = false) { el('codeStatus').textContent = message; el('codeStatus').classList.toggle('error', error); }
function lines() {
    el('lineNumbers').textContent = Array.from({ length: source.value.split('\n').length }, (_, i) => i + 1).join('\n');
    el('lineNumbers').scrollTop = source.scrollTop;
    el('dirtyMark').textContent = dirty() ? '●' : '';
}
function title() { el('fileTitle').textContent = path || projectName || 'No file open'; document.title = `${path || 'Code'} · EinTheater`; lines(); }
function mayLeave() { return !dirty() || confirm('Discard unsaved code changes?'); }
async function listFiles() {
    const list = el('fileList');
    try {
        const data = await request('/api/code/files');
        list.replaceChildren(...data.files.map(name => {
            const button = document.createElement('button');
            button.textContent = name;
            button.title = name;
            button.classList.toggle('active', name === path);
            button.addEventListener('click', () => void openFile(name));
            return button;
        }));
    } catch (error) { list.replaceChildren(); status(error.message, true); }
}
async function checkPython() {
    try {
        const runtime = await request('/api/runtime/python');
        el('configurePython').hidden = !!runtime.available;
        if (!runtime.available) status('Python with PyTorch is unavailable. Configure Python to compile.', true);
    } catch (error) { status(error.message, true); }
}
async function scanClasses() {
    const select = el('modelClass');
    const scannedPath = path, scannedSource = source.value;
    if (!scannedPath || !scannedSource.trim()) { select.replaceChildren(new Option('Select class', '')); return; }
    try {
        const result = await request('/api/code/classes', json('POST', { path: scannedPath, source: scannedSource }));
        if (path !== scannedPath || source.value !== scannedSource) return;
        const previous = select.value;
        select.replaceChildren(new Option('Select class', ''));
        for (const name of result.classes || []) select.add(new Option(name, name));
        if ([...select.options].some(option => option.value === previous)) select.value = previous;
        else if (result.classes?.length === 1) select.value = result.classes[0];
    } catch (error) { status(error.message, true); }
}
async function openFile(name) {
    if (busy || name === path) return;
    try {
        await request('/api/code/file?path=' + encodeURIComponent(name));
        await syncDraft();
        await request('/api/code/active/bind', json('POST', { path: name }));
        await loadActive();
    } catch (error) { status(error.message, true); }
}
async function save() {
    if (!path || busy) return;
    busy = true;
    try {
        const savingSource = source.value;
        const data = await request('/api/code/file', json('PUT', { path, source: savingSource, expectedHash: savedHash }));
        savedSource = savingSource; savedHash = data.hash; await syncDraft(); title(); await listFiles(); status(`Saved ${path}`);
    } catch (error) { status(error.message, true); }
    finally { busy = false; }
}
async function compile() {
    if (!path || busy) return;
    await scanClasses();
    let replace = false;
    if (replaceRequired) {
        if (!confirm('Compile will replace the Canvas graph linked to this file. Continue?')) return;
        replace = true;
    }
    busy = true; status('Compiling with TorchFX…');
    try {
        const result = await request('/api/code/compile', json('POST', { path, source: source.value, className: el('modelClass').value, replace }));
        projectId = result.projectId;
        replaceRequired = true;
        await syncDraft();
        status(`Compiled ${result.nodeCount} nodes and ${result.edgeCount} edges. Opening Canvas…`);
        navigatingWithDraft = true;
        window.location.assign('/canvas');
    } catch (error) { navigatingWithDraft = false; status(error.message, true); }
    finally { busy = false; }
}
el('newFile').addEventListener('click', async () => {
    const name = prompt('New Python file name (relative to workspace):', 'model.py');
    if (name === null) return;
    if (!name.trim().endsWith('.py')) { status('Use a .py filename.', true); return; }
    if (name.trim() === path) return;
    try {
        await syncDraft();
        await request('/api/code/active/bind', json('POST', { path: name.trim() }));
        await loadActive();
        status(`Working on ${path}; Save to create it.`); source.focus();
    } catch (error) { status(error.message, true); }
});
el('saveCode').addEventListener('click', () => void save());
el('compileCode').addEventListener('click', () => void compile());
el('configurePython').addEventListener('click', async () => {
    let executable = '';
    if (window.einDesktop?.selectPythonExecutable) executable = await window.einDesktop.selectPythonExecutable();
    else executable = prompt('Path to Python executable:') || '';
    if (!executable) return;
    try {
        await request('/api/runtime/python', json('POST', { path: executable }));
        await checkPython();
        status('Python is ready.');
    } catch (error) { status(error.message, true); }
});
el('deleteFile').addEventListener('click', async () => {
    if (!path || !savedHash || busy || !confirm(`Delete ${path}${dirty() ? ' and discard unsaved edits' : ''}?`)) return;
    try {
        await request('/api/code/file', json('DELETE', { path, expectedHash: savedHash }));
        await loadActive(); status('File deleted.');
    } catch (error) { status(error.message, true); }
});
el('findNext').addEventListener('click', () => {
    const term = el('searchCode').value;
    if (!term) return;
    let at = source.value.toLowerCase().indexOf(term.toLowerCase(), source.selectionEnd);
    if (at < 0) at = source.value.toLowerCase().indexOf(term.toLowerCase());
    if (at >= 0) { source.focus(); source.setSelectionRange(at, at + term.length); }
});
el('searchCode').addEventListener('keydown', event => { if (event.key === 'Enter') el('findNext').click(); });
source.addEventListener('scroll', () => { el('lineNumbers').scrollTop = source.scrollTop; });
let scanTimer;
source.addEventListener('input', () => { lines(); clearTimeout(scanTimer); scanTimer = setTimeout(() => void scanClasses(), 400); });
source.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
        event.preventDefault();
        const start = source.selectionStart, end = source.selectionEnd;
        source.setRangeText('    ', start, end, 'end'); lines();
    }
});
window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); } });
window.addEventListener('beforeunload', event => { if (dirty() && !navigatingWithDraft) { event.preventDefault(); event.returnValue = ''; } });
window.saveActiveModel = save;
window.prepareModeSwitch = async () => {
    if (busy) throw new Error('Code operation is still running');
    await syncDraft();
    navigatingWithDraft = true;
};
window.beforeWorkspaceChange = () => !busy && mayLeave();
window.addEventListener('workspacechanged', () => {
    void loadActive().catch(error => status(error.message, true));
});
title(); void (async () => {
    try { await loadActive(); } catch (error) { status(error.message, true); }
    await checkPython();
})();
