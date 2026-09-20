export const workspaceApi = {
    async fetchWorkspace() {
        const res = await fetch('/api/workspace');
        if (!res.ok) throw new Error(await res.text() || 'Failed to fetch workspace');
        return await res.json();
    },

    async setWorkspace(path) {
        const res = await fetch(`/api/workspace/set?path=${encodeURIComponent(path)}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to set workspace');
        return await res.json();
    },

    async browseDirectory(dir = '') {
        const url = dir ? `/api/workspace/browse?dir=${encodeURIComponent(dir)}` : '/api/workspace/browse';
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text() || 'Failed to browse directory');
        return await res.json();
    },

    async selectNativeFolder() {
        const res = await fetch('/api/workspace/select-native', { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to open native folder picker');
        return await res.json();
    },

    async createFolder(dir, name) {
        const res = await fetch('/api/workspace/create-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dir, name })
        });
        if (!res.ok) throw new Error(await res.text() || 'Failed to create folder');
        return await res.json();
    },

    async deleteModelFolder(path) {
        const res = await fetch('/api/workspace/delete-model-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!res.ok) throw new Error(await res.text() || 'Failed to delete model folder');
        return await res.json();
    },

    async inspectModel(path) {
        const res = await fetch(`/api/workspace/inspect-model?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
            const errText = await res.text();
            try {
                const parsed = JSON.parse(errText);
                throw new Error(parsed.error || errText);
            } catch (e) {
                throw new Error(errText || 'Failed to inspect model folder');
            }
        }
        return await res.json();
    },

    async saveModel(projectId = '', dir = '') {
        const res = await fetch('/api/workspace/save-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, dir })
        });
        if (!res.ok) {
            const errText = await res.text();
            try {
                const parsed = JSON.parse(errText);
                throw new Error(parsed.error || errText);
            } catch (e) {
                throw new Error(errText || 'Failed to save model');
            }
        }
        return await res.json();
    },

    async loadModel(path) {
        const res = await fetch('/api/workspace/load-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Failed to load model from folder');
        }
        return await res.json();
    }
};
