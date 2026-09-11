// ── Backend API Client ──────────────────────────────────────────

export const api = {
    // Project management
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
    },

    // Workspace & Working Directory
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

    // Graph data & operations
    async fetchGraphData() {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error(await res.text() || 'Failed to load graph data');
        return await res.json();
    },

    async addNode(label, layerType, x, y, params = null) {
        let res;
        if (params) {
            res = await fetch('/api/addNode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label, layerType, x, y, params })
            });
        } else {
            res = await fetch(`/api/addNode?label=${encodeURIComponent(label)}&layerType=${encodeURIComponent(layerType)}&x=${x}&y=${y}`, { method: 'POST' });
        }
        if (!res.ok) throw new Error(await res.text() || 'Failed to add node');
        return await res.json();
    },

    async pasteGraph(nodes, edges, dx = 50, dy = 50) {
        const res = await fetch('/api/paste', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodes, edges, dx, dy })
        });
        if (!res.ok) throw new Error(await res.text() || 'Failed to paste elements');
        return await res.json();
    },

    async updateNode(nodeData) {
        const res = await fetch('/api/updateNode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nodeData)
        });
        if (!res.ok) throw new Error(await res.text() || 'Failed to update node');
        return res;
    },

    async deleteNode(id) {
        const res = await fetch(`/api/deleteNode?id=${encodeURIComponent(id)}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to delete node');
        return res;
    },

    async deleteNodes(ids) {
        const res = await fetch('/api/deleteNodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ids)
        });
        if (!res.ok) throw new Error(await res.text() || 'Failed to delete nodes');
        return res;
    },

    async moveNode(id, x, y, updateEdges = true) {
        const updateParam = updateEdges ? '' : '&update_edges=false';
        const res = await fetch(`/api/moveNode?id=${encodeURIComponent(id)}&x=${x}&y=${y}${updateParam}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to move node');
        return res;
    },

    async moveNodes(items) {
        const res = await fetch('/api/moveNodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
        if (!res.ok) throw new Error(await res.text() || 'Failed to move nodes');
        return res;
    },

    async addEdge(from, to, lines = null) {
        let res;
        if (lines && lines.length > 0) {
            res = await fetch('/api/addEdge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: String(from), to: String(to), lines })
            });
        } else {
            res = await fetch(`/api/addEdge?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: 'POST' });
        }
        if (!res.ok) throw new Error(await res.text() || 'Failed to add edge');
        return await res.json();
    },

    async updateEdge(id, lines, edgeType = null) {
        const res = await fetch('/api/updateEdge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, lines, edgeType })
        });
        if (!res.ok) throw new Error(await res.text() || 'Failed to update edge');
        return await res.json();
    },

    async updateEdges(items) {
        const res = await fetch('/api/updateEdges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
        if (!res.ok) throw new Error(await res.text() || 'Failed to update edges');
        return res;
    },

    async deleteEdge(id) {
        const res = await fetch(`/api/deleteEdge?id=${encodeURIComponent(id)}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to delete edge');
        return res;
    },

    async clearGraph() {
        const res = await fetch('/api/clear', { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to clear graph');
        return res;
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
