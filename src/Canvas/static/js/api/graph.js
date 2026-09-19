export const graphApi = {
    async history(projectId = null) {
        const res = await fetch('/api/history' + (projectId ? '?projectId=' + encodeURIComponent(projectId) : ''));
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async changeHistory(direction, projectId) {
        const res = await fetch(`/api/history/${direction}?projectId=${encodeURIComponent(projectId)}`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async dragSelection(nodes, edges, projectId) {
        const res = await fetch('/api/edit/drag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodes, edges, projectId }) });
        if (!res.ok) throw new Error(await res.text());
    },
    async deleteSelection(nodes, edges, projectId) {
        const res = await fetch('/api/edit/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodes, edges, projectId }) });
        if (!res.ok) throw new Error(await res.text());
    },
    async fetchGraphData({ analyze = true, projectId = null } = {}) {
        const query = new URLSearchParams();
        if (!analyze) query.set('analyze', 'false');
        if (projectId) query.set('projectId', projectId);
        const res = await fetch('/api/data' + (query.size ? '?' + query : ''));
        if (!res.ok) throw new Error(await res.text() || 'Failed to load graph data');
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

    async clearGraph() {
        const res = await fetch('/api/clear', { method: 'POST' });
        if (!res.ok) throw new Error(await res.text() || 'Failed to clear graph');
        return res;
    }
};
