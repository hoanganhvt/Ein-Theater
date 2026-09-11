// ── Main Application Entry Point ──────────────────────────────────
// Imports modular components, binds global UI handlers, and initializes the app

import { state } from './js/state.js';
import { api } from './js/api.js';
import { esc } from './js/utils.js';
import { initSchemas, MODULES_LIST, LAYER_SCHEMAS, getDefaultParams, getLayerBaseType, formatNodeLabel } from './js/schemas.js';
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
    populateCategoryDropdown,
    populateNodeTypeDropdown,
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
import { renderPalette, setupPaletteDragAndDrop } from './js/palette.js';
import { loadSidebar, switchMode, getActiveSidebarMode } from './js/sidebarLoader.js';
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
    closeFileMenu,
    saveActiveModel,
    promptCreateFolderModal,
    promptCreateFolderSidebar,
    loadModelFromFolder
} from './js/workspace.js';
import { invertEdgeFold, getEdgeAtCanvasPos } from './js/circuit.js';
import {
    copySelection,
    cutSelection,
    pasteClipboard,
    pasteClipboardAtContext,
    selectAllNodes,
    setupClipboardShortcuts,
    updateClipboardUI
} from './js/clipboard.js';

export function invertSelectedEdgeFold() {
    const selEdgeIds = state.network ? state.network.getSelectedEdges() : [];
    if (selEdgeIds && selEdgeIds.length > 0) {
        invertEdgeFold(selEdgeIds[0]);
    }
}

// ── Attach Public Handlers to Window for Inline HTML Event Handlers ───
Object.assign(window, {
    state,
    api,
    getEdgeAtCanvasPos,
    invertSelectedEdgeFold,
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
    populateCategoryDropdown,
    populateNodeTypeDropdown,
    toggleCustom,
    cancelNode,
    saveNode,
    openEditNodeModal,
    openEditNodeFromContext,
    closeEditModal,
    closeAllModals,
    saveEditNode,

    // Context Menu & Clipboard Actions
    hideContextMenu,
    deleteSelectionFromContextMenu,
    copySelection,
    cutSelection,
    pasteClipboard,
    pasteClipboardAtContext,
    selectAllNodes,
    updateClipboardUI,

    // Workspace & File Menu
    openSelectFolderModal,
    closeSelectFolderModal,
    browseTo,
    browseParentFolder,
    applyTypedPath,
    confirmSelectFolder,
    browseSystemFolder,
    toggleFileMenu,
    closeFileMenu,
    saveActiveModel,
    promptCreateFolderModal,
    promptCreateFolderSidebar,
    loadModelFromFolder,

    // Custom Mode Sidebar Loader & Mode Switcher
    loadSidebar,
    switchMode,
    getActiveSidebarMode
});

// ── Application Initialization ────────────────────────────────────
export async function initApp() {
    await initSchemas();
    populateCategoryDropdown();
    populateNodeTypeDropdown();

    // Dynamically load mode-specific sidebar via Custom Sidebar Loader
    const hasSidebar = !!document.querySelector('.sidebar');
    if (!hasSidebar) {
        await loadSidebar('canvas');
    } else {
        renderPalette();
        await initWorkspace();
        await loadProjects();
        setupPaletteDragAndDrop();
    }

    await loadGraph();
    setupCanvasClickAdd();
    setupBoxSelection();
    setupContextMenu();
    setupClipboardShortcuts();

    // Global shortcut: Ctrl+S or Cmd+S to save model
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            saveActiveModel();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
