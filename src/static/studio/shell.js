const dialog = document.getElementById('shellFolderDialog');
const pathInput = document.getElementById('shellFolderPath');
const list = document.getElementById('shellFolderList');
const error = document.getElementById('shellFolderError');
let current = '';
let parent = '';
let selected = '';

async function request(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error((await response.text()).trim());
    return response.json();
}

async function refreshWorkspace() {
    const data = await request('/api/workspace');
    const label = document.getElementById('menuWorkingDir');
    label.textContent = data.name || 'None';
    label.title = data.workingDir || '';
}

async function browse(path = '') {
    error.textContent = '';
    selected = '';
    try {
        const data = await request('/api/workspace/browse' + (path ? '?dir=' + encodeURIComponent(path) : ''));
        current = data.current;
        document.getElementById('shellFolderConfirm').disabled = false;
        parent = data.parent || '';
        selected = '';
        pathInput.value = current;
        list.replaceChildren();
        for (const folder of data.folders || []) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'shell-folder-row';
            row.textContent = folder.name;
            row.title = folder.path;
            row.addEventListener('click', () => {
                selected = folder.path;
                pathInput.value = selected;
                list.querySelectorAll('.selected').forEach(item => item.classList.remove('selected'));
                row.classList.add('selected');
            });
            row.addEventListener('dblclick', () => browse(folder.path));
            list.appendChild(row);
        }
    } catch (cause) { error.textContent = cause.message; document.getElementById('shellFolderConfirm').disabled = true; }
}

window.openSelectFolderModal = () => { dialog.showModal(); void browse(); };
document.getElementById('shellOpenFolder').addEventListener('click', window.openSelectFolderModal);
document.getElementById('shellFolderGo').addEventListener('click', () => browse(pathInput.value.trim()));
pathInput.addEventListener('keydown', event => { if (event.key === 'Enter') browse(pathInput.value.trim()); });
document.getElementById('shellFolderUp').addEventListener('click', () => { if (parent) browse(parent); });
document.getElementById('shellFolderCancel').addEventListener('click', () => dialog.close());
document.getElementById('shellFolderConfirm').addEventListener('click', async () => {
    try {
        const data = await request('/api/workspace/set?path=' + encodeURIComponent(selected || current), { method: 'POST' });
        dialog.close();
        await refreshWorkspace();
    } catch (cause) { error.textContent = cause.message; }
});
document.getElementById('shellFolderNative').addEventListener('click', async () => {
    try {
        const data = await request('/api/workspace/select-native', { method: 'POST' });
        if (!data.cancelled) { dialog.close(); await refreshWorkspace(); }
    } catch (cause) { error.textContent = cause.message; }
});
void refreshWorkspace();
