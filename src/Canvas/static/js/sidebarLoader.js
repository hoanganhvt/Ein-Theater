// ── Custom Sidebar Loader ──────────────────────────────────────────
// Dynamically loads, mounts, and initializes mode-specific sidebars.

import { renderPalette, setupPaletteDragAndDrop } from './palette.js';
import { initWorkspace } from './workspace.js';
import { loadProjects } from './projects.js';

let activeSidebarMode = null;

/**
 * Dynamically loads and injects the mode-specific sidebar into the DOM.
 * @param {string} mode - 'canvas' | 'data' | 'train' | 'code'
 * @returns {Promise<boolean>}
 */
export async function loadSidebar(mode = 'canvas') {
    const slot = document.getElementById('sidebarSlot') ||
                 document.getElementById('sidebarContainer') ||
                 document.getElementById('appSidebar');

    if (!slot) {
        console.warn('[SidebarLoader] No sidebar container (#sidebarSlot) found in DOM.');
        return false;
    }

    try {
        const response = await fetch(`/api/sidebar?mode=${encodeURIComponent(mode)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch sidebar for mode "${mode}" (HTTP ${response.status})`);
        }
        const html = await response.text();
        slot.innerHTML = html;
        activeSidebarMode = mode;

        // Initialize mode-specific hooks
        if (mode === 'canvas') {
            await initWorkspace();
            await loadProjects();
            renderPalette();
            setupPaletteDragAndDrop();
        }

        window.dispatchEvent(new CustomEvent('sidebar:loaded', { detail: { mode } }));
        return true;
    } catch (err) {
        console.error(`[SidebarLoader] Error loading sidebar for mode "${mode}":`, err);
        return false;
    }
}

/**
 * Returns the currently active sidebar mode name.
 */
export function getActiveSidebarMode() {
    return activeSidebarMode;
}

/**
 * Switches the application mode and updates the sidebar.
 * @param {string} mode
 */
export async function switchMode(mode) {
    if (mode !== 'canvas') {
        alert(`Mode "${mode.toUpperCase()}" is under development and coming soon!`);
        return;
    }

    document.querySelectorAll('.mode-tab').forEach(tab => {
        if (tab.dataset.mode === mode) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    await loadSidebar(mode);
}
