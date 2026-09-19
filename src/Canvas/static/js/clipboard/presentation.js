import { state } from '../state.js';
import { hasClipboardData } from './operations.js';
/** Selects all nodes on the active canvas. */
export function selectAllNodes() {
    if (!state.network || !state.nodesDataSet) return;
    const allIds = state.nodesDataSet.getIds();
    if (allIds && allIds.length > 0) {
        state.network.selectNodes(allIds);
        updateClipboardUI();
    }
}

/** Updates button styling and disabled states across toolbar and menus. */
export function updateClipboardUI() {
    const hasSelection = state.network && state.network.getSelectedNodes().length > 0;
    const hasAnySelection = hasSelection || (state.network && state.network.getSelectedEdges().length > 0);
    const hasClip = hasClipboardData();

    const btnCopy = document.getElementById('btnCopySelection');
    if (btnCopy) {
        btnCopy.classList.toggle('disabled', !hasSelection);
        if (hasSelection) {
            btnCopy.removeAttribute('disabled');
        } else {
            btnCopy.setAttribute('disabled', 'true');
        }
    }

    const btnPaste = document.getElementById('btnPasteClipboard');
    if (btnPaste) {
        btnPaste.classList.toggle('disabled', !hasClip);
        if (hasClip) {
            btnPaste.removeAttribute('disabled');
        } else {
            btnPaste.setAttribute('disabled', 'true');
        }
    }
    for (const [command, enabled] of Object.entries({ copy: hasSelection, cut: hasSelection, paste: hasClip, 'select-all': !!state.nodesDataSet?.length, clear: !!state.nodesDataSet?.length })) {
        document.querySelectorAll?.(`[data-command="${command}"]`).forEach(item => item.disabled = !enabled);
    }
}
