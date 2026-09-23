import { state } from '../state.js';
import { api } from '../api.js';

// chooseWorkspace is the single workspace-selection flow for Electron and web development.
export async function chooseWorkspace(initialPath = state.workingDir || '') {
    let selected = '';
    if (window.einDesktop?.selectDirectory) {
        selected = await window.einDesktop.selectDirectory(initialPath);
        if (!selected) return { cancelled: true };
    } else {
        const result = await api.selectNativeFolder();
        if (result.cancelled) return result;
        selected = result.workingDir || '';
    }
    if (!selected) return { cancelled: true };

    const data = await api.setWorkspace(selected);
    state.workingDir = data.workingDir;
    state.workingDirName = data.name;
    const sidebar = await import('./sidebar.js');
    sidebar.updateWorkspaceUI(data.workingDir, data.name);
    await sidebar.loadWorkspaceFiles(data.workingDir);
    return { cancelled: false, ...data };
}
