// ── Application State Container ──────────────────────────────────
// Holds shared reactive state across components

export const state = {
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
