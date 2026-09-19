import { api } from './api.js';
import { state } from './state.js';
import { loadGraph } from './graph/loading.js';
import { loadProjects } from './projects/list.js';

let busy = false;

export async function refreshHistory() {
    if (!state.currentProjectId) return;
    try {
        const result = await api.history(state.currentProjectId);
        if (result.graph.projectId !== state.currentProjectId) return;
        document.querySelectorAll('[data-command="undo"]').forEach(item => item.disabled = !result.canUndo || busy);
        document.querySelectorAll('[data-command="redo"]').forEach(item => item.disabled = !result.canRedo || busy);
    } catch (error) { console.error('Unable to load edit history:', error); }
}

export async function changeHistory(direction) {
    if (busy || !state.currentProjectId) return;
    busy = true;
    const projectId = state.currentProjectId;
    api.invalidateShapeRefresh();
    try {
        const result = await api.changeHistory(direction, projectId);
        if (result.graph.projectId === state.currentProjectId) await Promise.all([loadGraph({ projectId }), loadProjects()]);
    } catch (error) {
        console.error(`Unable to ${direction}:`, error);
        alert(`Unable to ${direction}: ${error.message}`);
    } finally { busy = false; await refreshHistory(); }
}

export const undoCanvas = () => changeHistory('undo');
export const redoCanvas = () => changeHistory('redo');
