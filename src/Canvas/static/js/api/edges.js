export const edgesApi = {
    async addEdge(from, to, lines = null, foldMode = null, customFold = null, edgeType = null) {
        let res;
        const payload = { from: String(from), to: String(to) };
        if (lines && lines.length > 0) payload.lines = lines;
        if (foldMode) payload.foldMode = foldMode;
        if (customFold !== null && customFold !== undefined) payload.customFold = customFold;
        if (edgeType) payload.edgeType = edgeType;

        if (lines || foldMode || customFold !== null || edgeType) {
            res = await fetch('/api/addEdge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`/api/addEdge?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: 'POST' });
        }
        if (!res.ok) throw new Error(await res.text() || 'Failed to add edge');
        return await res.json();
    },

    async updateEdge(id, lines, edgeType = null, foldMode = null, customFold = null) {
        const payload = { id, lines };
        if (edgeType !== null) payload.edgeType = edgeType;
        if (foldMode !== null) payload.foldMode = foldMode;
        if (customFold !== null && customFold !== undefined) payload.customFold = customFold;

        const res = await fetch('/api/updateEdge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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
    }
};
