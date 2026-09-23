export const runtimeApi = {
    async pythonStatus() {
        const response = await fetch('/api/runtime/python');
        if (!response.ok) throw new Error(await response.text() || 'Could not inspect Python runtime');
        return response.json();
    },
    async setPython(path) {
        const response = await fetch('/api/runtime/python', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'The selected Python cannot import PyTorch');
        return data;
    }
};
