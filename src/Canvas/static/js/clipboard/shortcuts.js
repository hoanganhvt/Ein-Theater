import { state } from '../state.js';
import { hasClipboardData, copySelection, cutSelection, pasteClipboard } from './operations.js';
import { selectAllNodes, updateClipboardUI } from './presentation.js';
/**
 * Registers global keyboard shortcuts:
 * - Ctrl+C / Cmd+C: Copy selected node(s) and internal edges
 * - Ctrl+V / Cmd+V: Paste copied elements
 * - Ctrl+X / Cmd+X: Cut selected node(s) and internal edges
 * - Ctrl+A / Cmd+A: Select all nodes
 */
export function setupClipboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        // If user is editing inside a form field, let standard browser copy/paste take place
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        // If any modal dialog is currently visible, do not intercept canvas shortcuts
        const overlay = document.getElementById('modalOverlay');
        if (overlay && overlay.style.display === 'block') return;

        const isCtrl = e.ctrlKey || e.metaKey;
        if (!isCtrl) return;

        const key = e.key.toLowerCase();
        if (key === 'c') {
            const hasSel = state.network && state.network.getSelectedNodes().length > 0;
            if (hasSel) {
                e.preventDefault();
                copySelection();
            }
        } else if (key === 'v') {
            if (hasClipboardData()) {
                e.preventDefault();
                pasteClipboard();
            }
        } else if (key === 'x') {
            const hasSel = state.network && state.network.getSelectedNodes().length > 0;
            if (hasSel) {
                e.preventDefault();
                cutSelection();
            }
        } else if (key === 'a') {
            if (state.nodesDataSet && state.nodesDataSet.length > 0) {
                e.preventDefault();
                selectAllNodes();
            }
        }
    });

    // Update UI on initial boot
    updateClipboardUI();
}
