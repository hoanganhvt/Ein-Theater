// ── Main Application Entry Point ──────────────────────────────────
// Imports modular components, binds global UI handlers, and initializes the app

import { initSchemas } from '../schemas.js';
import { loadProjects } from '../projects.js';
import { loadGraph } from '../graph.js';
import { setupCanvasClickAdd } from '../modes.js';
import { populateCategoryDropdown, populateNodeTypeDropdown } from '../modals.js';
import { renderPalette, setupPaletteDragAndDrop } from '../palette.js';
import { loadSidebar } from '../sidebarLoader.js';
import { setupBoxSelection } from '../selection.js';
import { setupContextMenu } from '../contextMenu.js';
import { initWorkspace, saveActiveModel } from '../workspace.js';

import { setupClipboardShortcuts } from '../clipboard.js';
import { trackCanvasEdits } from './pending.js';
import { initPythonRuntime } from '../runtime.js';

// ── Application Initialization ────────────────────────────────────
export async function initApp() {
    trackCanvasEdits();
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
    void initPythonRuntime();
    window.addEventListener('beforeunload', () => {
        const { state } = window;
        if (!state?.network || !state.currentProjectId) return;
        try { localStorage.setItem('ein_view_' + state.currentProjectId, JSON.stringify({ position: state.network.getViewPosition(), scale: state.network.getScale() })); } catch (_) {}
    });

    // Global shortcut: Ctrl+S or Cmd+S to save model
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            saveActiveModel();
        }
    });
}
