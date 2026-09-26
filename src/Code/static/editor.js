const el = id => document.getElementById(id);
const source = el('codeSource');
const pythonKeywords = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
function highlightPython(text) {
    const escape = value => value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
    // ponytail: lexical colors only; use a Python parser if f-string expressions need separate colors.
    const tokens = /#[^\n]*|(?:\b(?:br|rb|fr|rf|r|u|b|f))?(?:"""(?:\\[\s\S]|(?!""")[^\\])*?(?:"""|$)|'''(?:\\[\s\S]|(?!''')[^\\])*?(?:'''|$)|"(?:\\[\s\S]|[^"\\\n])*(?:"|(?=\n)|$)|'(?:\\[\s\S]|[^'\\\n])*(?:'|(?=\n)|$))|\b0(?:x(?:_?[\da-f])+|o(?:_?[0-7])+|b(?:_?[01])+)|(?:\b\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:e[+-]?\d(?:_?\d)*)?j?|[\p{L}_][\p{L}\p{N}_]*/giu;
    let html = '', end = 0;
    for (const match of text.matchAll(tokens)) {
        const token = match[0];
        const kind = token.startsWith('#') ? 'comment' : /['"]/.test(token) ? 'string'
            : /^[\d.]/.test(token) ? 'number' : pythonKeywords.has(token) ? 'keyword' : '';
        html += escape(text.slice(end, match.index));
        html += kind ? `<span class="code-${kind}">${escape(token)}</span>` : escape(token);
        end = match.index + token.length;
    }
    return html + escape(text.slice(end));
}
function syncScroll() {
    // Reserve the textarea's horizontal scrollbar height so the gutter can reach the last line.
    el('lineNumbers').style.paddingBottom = `${12 + source.offsetHeight - source.clientHeight}px`;
    el('lineNumbers').scrollTop = source.scrollTop;
    el('codeHighlight').scrollTop = source.scrollTop;
    el('codeHighlight').scrollLeft = source.scrollLeft;
}
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
    title(); await Promise.all([listProjects(), listFiles(), scanClasses()]);
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
    el('codeHighlightText').innerHTML = highlightPython(source.value) + '\u200b';
    el('lineNumbers').textContent = Array.from({ length: source.value.split('\n').length }, (_, i) => i + 1).join('\n');
    syncScroll();
    el('dirtyMark').textContent = dirty() ? '●' : '';
}
function title() { el('fileTitle').textContent = path || projectName || 'No file open'; document.title = `${path || 'Code'} · EinTheater`; lines(); }
function mayLeave() { return !dirty() || confirm('Discard unsaved code changes?'); }
async function listProjects() {
    const list = el('codeProjectList');
    try {
        const data = await request('/api/projects');
        list.replaceChildren(...data.projects.map(project => {
            const button = document.createElement('button');
            button.textContent = project.name;
            button.title = project.name;
            button.classList.toggle('active', project.id === data.current);
            if (project.id === data.current) button.setAttribute('aria-current', 'true');
            button.addEventListener('click', () => void switchProject(project.id));
            return button;
        }));
    } catch (error) { list.replaceChildren(); status(error.message, true); }
}
async function switchProject(id) {
    if (busy || id === projectId) return;
    busy = true;
    try {
        await syncDraft();
        await request('/api/projects/switch?id=' + encodeURIComponent(id), { method: 'POST' });
        await loadActive();
    } catch (error) { status(error.message, true); }
    finally { busy = false; }
}
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
source.addEventListener('scroll', syncScroll);
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
