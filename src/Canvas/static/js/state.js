// ── Application State Container ──────────────────────────────────
// Holds shared application references and transient UI state (a plain object).

export const state = {
    currentProjectId: null,
    network: null,
    nodesDataSet: null,
    edgesDataSet: null,
    addNodeCallback: null,
    tempNodeData: null,
    currentMode: 'move', // 'move' | 'select' | 'add' | 'connect'
    contextClickPos: null,
    editingNodeId: null,
    editingLayerType: null,

    // Working directory state
    workingDir: '',
    workingDirName: '',
    browsingDir: '',
    workspaceFiles: []
};
