import { api } from '../api.js';
import { fixModelName } from '../utils.js';
import { loadProjects } from './list.js';
// ── Model Title Renaming ──────────────────────────────────────────

export function startRename() {
    const title = document.getElementById('modelTitle');
    const input = document.getElementById('modelTitleInput');
    if (!title || !input) return;
    if (input.style.display === 'block') return;
    input.value = title.textContent.trim();
    title.style.display = 'none';
    input.style.display = 'block';
    input.focus();
    input.select();
}

export async function commitRename() {
    const title = document.getElementById('modelTitle');
    const input = document.getElementById('modelTitleInput');
    if (!title || !input) return;
    const rawName = input.value.trim() || title.textContent.trim() || 'Untitled_Model';
    const newName = fixModelName(rawName);
    input.style.display = 'none';
    title.style.display = '';
    title.textContent = newName;
    document.title = newName + ' – Neural Network Builder';
    try {
        await api.renameModel(newName);
        await loadProjects(); // Refresh sidebar so name syncs there too
    } catch (e) {
        console.error('Failed to save name:', e);
    }
}

export function cancelRename() {
    const input = document.getElementById('modelTitleInput');
    const title = document.getElementById('modelTitle');
    if (input) input.style.display = 'none';
    if (title) title.style.display = '';
}
