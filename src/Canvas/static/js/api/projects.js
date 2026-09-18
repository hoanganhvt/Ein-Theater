export const projectsApi = {
    async fetchProjects() {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error(await res.text() || 'Failed to fetch projects');
        return await res.json();
    },

    async createProject(name) {
        const res = await fetch(`/api/projects/create?name=${encodeURIComponent(name)}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to create project');
        return res;
    },

    async switchProject(id) {
        const res = await fetch(`/api/projects/switch?id=${encodeURIComponent(id)}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to switch project');
        return res;
    },

    async deleteProject(id) {
        const res = await fetch(`/api/projects/delete?id=${encodeURIComponent(id)}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to delete project');
        return res;
    },

    async renameModel(name) {
        const res = await fetch(`/api/rename?name=${encodeURIComponent(name)}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to rename model');
        return res;
    }
};
