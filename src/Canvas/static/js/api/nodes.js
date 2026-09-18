export const nodesApi = {
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

    async updateNode(idOrData, maybeData = null) {
        let payload;
        if (maybeData !== null) {
            payload = { id: String(idOrData), ...maybeData };
        } else if (typeof idOrData === 'object' && idOrData !== null) {
            payload = idOrData;
        } else {
            payload = { id: String(idOrData) };
        }
        const res = await fetch('/api/updateNode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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
    }
};
