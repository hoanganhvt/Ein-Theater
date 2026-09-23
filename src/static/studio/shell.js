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
    return data;
}

window.chooseWorkspace = async () => {
    try {
        const current = await refreshWorkspace();
        let selected = '';
        if (window.einDesktop?.selectDirectory) {
            selected = await window.einDesktop.selectDirectory(current.workingDir || '');
            if (!selected) return;
        } else {
            const result = await request('/api/workspace/select-native', { method: 'POST' });
            if (result.cancelled) return;
            selected = result.workingDir;
        }
        await request('/api/workspace/set?path=' + encodeURIComponent(selected), { method: 'POST' });
        await refreshWorkspace();
    } catch (cause) {
        window.alert('Could not open folder: ' + cause.message);
    }
};

document.getElementById('shellOpenFolder')?.addEventListener('click', window.chooseWorkspace);
void refreshWorkspace();
