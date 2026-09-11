// ── Project Management & Model Title ──────────────────────────────
import { api } from './api.js';
import { esc, fixModelName } from './utils.js';
import { loadGraph } from './graph.js';

export async function loadProjects() {
    try {
        const data = await api.fetchProjects();
        renderProjectList(data.projects || [], data.current);
    } catch (e) {
        console.error('Failed to load projects:', e);
    }
}

export function renderProjectList(list, currentId) {
    const container = document.getElementById('projectList');
    if (!container) return;
    container.innerHTML = '';
    list.forEach(p => {
        const item = document.createElement('div');
        item.className = 'project-item' + (p.id === currentId ? ' active' : '');
        item.title = p.name;
        item.innerHTML =
            `<span class="project-icon">🧠</span>` +
            `<span class="project-name">${esc(p.name)}</span>` +
            `<button class="btn-delete-project" title="Delete model"
                     onclick="deleteProject(event,'${esc(p.id)}')">✕</button>`;
        item.addEventListener('click', () => switchProject(p.id));
        container.appendChild(item);
    });
}

export async function createProject() {
    const name = prompt('New model name:', 'Untitled Model');
    if (name === null) return;
    try {
        await api.createProject(name.trim() || 'Untitled Model');
        await loadProjects();
        await loadGraph();
    } catch (e) {
        console.error('Failed to create project:', e);
    }
}

export async function switchProject(id) {
    try {
        await api.switchProject(id);
        await loadProjects();
        await loadGraph();
    } catch (e) {
        console.error('Failed to switch project:', e);
        alert(e.message);
    }
}

export async function deleteProject(event, id) {
    if (event) event.stopPropagation();
    if (!confirm('Delete this model? This cannot be undone.')) return;
    try {
        await api.deleteProject(id);
        await loadProjects();
        await loadGraph();
    } catch (e) {
        console.error('Failed to delete project:', e);
        alert(e.message);
    }
}

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
