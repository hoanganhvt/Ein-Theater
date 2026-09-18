export const graphApi = {
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
