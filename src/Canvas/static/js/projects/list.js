import { api } from '../api.js';
import { esc } from '../utils.js';
import { loadGraph } from '../graph.js';
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
            `<span class="project-icon">&#9671;</span>` +
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
        await Promise.all([loadProjects(), loadGraph()]);
    } catch (e) {
        console.error('Failed to create project:', e);
    }
}

export async function switchProject(id) {
    try {
        await api.switchProject(id);
        await Promise.all([loadProjects(), loadGraph({ projectId: id })]);
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
        await Promise.all([loadProjects(), loadGraph()]);
    } catch (e) {
        console.error('Failed to delete project:', e);
        alert(e.message);
    }
}
