import { loadSidebar } from './loading.js';
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
