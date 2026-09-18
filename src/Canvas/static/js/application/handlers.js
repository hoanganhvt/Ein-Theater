// ── Main Application Entry Point ──────────────────────────────────
// Imports modular components, binds global UI handlers, and initializes the app

import { state } from '../state.js';
import { api } from '../api.js';

import { createProject, switchProject, deleteProject, startRename, commitRename, cancelRename } from '../projects.js';
import { fitView, clearGraph } from '../graph.js';
import { setMode } from '../modes.js';
import { openAddNodeModal, populateCategoryDropdown, populateNodeTypeDropdown, toggleCustom, saveNode, cancelNode, openAddNodeAtContext, openEditNodeModal, closeEditModal, closeAllModals, saveEditNode, openEditNodeFromContext } from '../modals.js';

import { loadSidebar, switchMode, getActiveSidebarMode } from '../sidebarLoader.js';

import { hideContextMenu, deleteSelectionFromContextMenu } from '../contextMenu.js';
import { openSelectFolderModal, closeSelectFolderModal, browseTo, browseParentFolder, applyTypedPath, confirmSelectFolder, browseSystemFolder, toggleFileMenu, closeFileMenu, saveActiveModel, promptCreateFolderModal, promptCreateFolderSidebar, loadModelFromFolder } from '../workspace.js';
import {
    invertEdgeFold,
    cycleEdgeFoldMode,
    getEdgeAtCanvasPos,
    getActiveEdgeId,
    openEditEdgeModal,
    closeEditEdgeModal,
    saveEditEdgeModal,
    deleteEdgeFromModal,
    deleteSelectedEdge,
    deleteSelectedEdgeFromBar,
    updateEdgeUISelection
} from '../circuit.js';
import { copySelection, cutSelection, pasteClipboard, pasteClipboardAtContext, selectAllNodes, updateClipboardUI } from '../clipboard.js';

export function invertSelectedEdgeFold() {
    const edgeId = getActiveEdgeId();
    if (edgeId) invertEdgeFold(edgeId);
}

export function cycleSelectedEdgeFold() {
    const edgeId = getActiveEdgeId();
    if (edgeId) cycleEdgeFoldMode(edgeId);
}

// ── Attach Public Handlers to Window for Inline HTML Event Handlers ───
Object.assign(window, {
    state,
    api,
    getEdgeAtCanvasPos,
    invertSelectedEdgeFold,
    cycleSelectedEdgeFold,
    openEditEdgeModal,
    closeEditEdgeModal,
    saveEditEdgeModal,
    deleteEdgeFromModal,
    deleteSelectedEdge,
    deleteSelectedEdgeFromBar,
    updateEdgeUISelection,
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
