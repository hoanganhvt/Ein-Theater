// ── Main Application Entry Point ──────────────────────────────────
// Imports modular components, binds global UI handlers, and initializes the app

import { state } from './js/state.js';
import { api } from './js/api.js';
import { esc } from './js/utils.js';
import { LAYER_SCHEMAS, getDefaultParams, getLayerBaseType, formatNodeLabel } from './js/schemas.js';
import {
    loadProjects,
    renderProjectList,
    createProject,
    switchProject,
    deleteProject,
    startRename,
    commitRename,
    cancelRename
} from './js/projects.js';
import {
    loadGraph,
    createBlock,
    fitView,
    clearGraph
} from './js/graph.js';
import {
    setMode,
    setupCanvasClickAdd
} from './js/modes.js';
import {
    openAddNodeModal,
    toggleCustom,
    saveNode,
    cancelNode,
    closeModal,
    openAddNodeAtContext,
    openEditNodeModal,
    closeEditModal,
    closeAllModals,
    saveEditNode,
    openEditNodeFromContext
} from './js/modals.js';
import { setupPaletteDragAndDrop } from './js/palette.js';
import { setupBoxSelection } from './js/selection.js';
import {
    setupContextMenu,
    hideContextMenu,
    deleteSelectionFromContextMenu
} from './js/contextMenu.js';
import {
    initWorkspace,
    openSelectFolderModal,
    closeSelectFolderModal,
    browseTo,
    browseParentFolder,
    applyTypedPath,
    confirmSelectFolder,
    browseSystemFolder,
    toggleFileMenu,
    closeFileMenu
} from './js/workspace.js';

// ── Attach Public Handlers to Window for Inline HTML Event Handlers ───
Object.assign(window, {
    // Project & Title
    createProject,
    switchProject,
    deleteProject,
    startRename,
    commitRename,
    cancelRename,

    // Canvas Modes & View
    setMode,
    fitView,
    clearGraph,

    // Modals & Block Manipulation
    openAddNodeModal,
    openAddNodeAtContext,
    toggleCustom,
    cancelNode,
    saveNode,
    openEditNodeModal,
    openEditNodeFromContext,
    closeEditModal,
    closeAllModals,
    saveEditNode,

    // Context Menu
    hideContextMenu,
    deleteSelectionFromContextMenu,

    // Workspace & File Menu
    openSelectFolderModal,
    closeSelectFolderModal,
    browseTo,
    browseParentFolder,
    applyTypedPath,
    confirmSelectFolder,
    browseSystemFolder,
    toggleFileMenu,
    closeFileMenu
});

// ── Application Initialization ────────────────────────────────────
export async function initApp() {
    await initWorkspace();
    await loadProjects();
    await loadGraph();
    setupPaletteDragAndDrop();
    setupCanvasClickAdd();
    setupBoxSelection();
    setupContextMenu();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
