// ── Context Menu (Right-Click Menu & Selection Deletion) ─────────
import { state } from './state.js';
import { api } from './api.js';
import { setMode } from './modes.js';
import { closeAllModals } from './modals.js';

export function setupContextMenu() {
    const container = document.getElementById('mynetwork');
    const menu = document.getElementById('contextMenu');
    if (!container || !menu) return;

    container.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        const rect = container.getBoundingClientRect();
        const domX = e.clientX - rect.left;
        const domY = e.clientY - rect.top;

        if (!state.network) return;

        // Capture canvas coordinates where user right-clicked
        state.contextClickPos = state.network.DOMtoCanvas({ x: domX, y: domY });

        const clickedNode = state.network.getNodeAt({ x: domX, y: domY });
        let currentSelected = state.network.getSelectedNodes();

        if (clickedNode) {
            // If right-clicked node is not in current multi-selection, select only it
            if (!currentSelected.includes(clickedNode)) {
                state.network.selectNodes([clickedNode]);
                currentSelected = [clickedNode];
            }
        }

        const count = currentSelected.length;
        const cmEdit = document.getElementById('cmEdit');
        const cmDelete = document.getElementById('cmDelete');
        const cmDeleteText = document.getElementById('cmDeleteText');

        if (cmEdit) {
            cmEdit.style.display = 'flex';
            if (count === 1) {
                cmEdit.classList.remove('disabled');
            } else {
                cmEdit.classList.add('disabled');
            }
        }

        if (cmDelete) {
            cmDelete.style.display = 'flex';
            if (count > 0) {
                cmDelete.classList.remove('disabled');
                cmDeleteText.textContent = count > 1 ? `Delete (${count} blocks)` : 'Delete';
            } else {
                cmDelete.classList.add('disabled');
                cmDeleteText.textContent = 'Delete';
            }
        }

        // Update active checkmarks for the 4 modes in context menu
        const checkMove = document.getElementById('cmCheckMove');
        const checkSelect = document.getElementById('cmCheckSelect');
        const checkAdd = document.getElementById('cmCheckAdd');
        const checkConnect = document.getElementById('cmCheckConnect');
        if (checkMove) checkMove.textContent = state.currentMode === 'move' ? '✓' : '';
        if (checkSelect) checkSelect.textContent = state.currentMode === 'select' ? '✓' : '';
        if (checkAdd) checkAdd.textContent = state.currentMode === 'add' ? '✓' : '';
        if (checkConnect) checkConnect.textContent = state.currentMode === 'connect' ? '✓' : '';

        // Position menu safely inside viewport
        menu.style.display = 'block';
        const menuWidth = menu.offsetWidth || 190;
        const menuHeight = menu.offsetHeight || 180;

        let posX = e.clientX;
        let posY = e.clientY;

        if (posX + menuWidth > window.innerWidth) {
            posX = Math.max(8, window.innerWidth - menuWidth - 8);
        }
        if (posY + menuHeight > window.innerHeight) {
            posY = Math.max(8, window.innerHeight - menuHeight - 8);
        }

        menu.style.left = posX + 'px';
        menu.style.top = posY + 'px';

        // Check if submenu will overflow right edge; if so, open submenu to the left
        const submenu = document.getElementById('cmSubmenu');
        if (submenu) {
            const submenuWidth = submenu.offsetWidth || 170;
            if (posX + menuWidth + submenuWidth > window.innerWidth) {
                submenu.classList.add('open-left');
            } else {
                submenu.classList.remove('open-left');
            }
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            hideContextMenu();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            closeAllModals();
            if (state.currentMode !== 'move') {
                setMode('move');
            }
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            const tag = document.activeElement ? document.activeElement.tagName : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            deleteSelectionFromContextMenu();
        }
    });
}

export function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
}

export async function deleteSelectionFromContextMenu() {
    hideContextMenu();
    if (!state.network) return;

    const selectedNodes = state.network.getSelectedNodes();
    const selectedEdges = state.network.getSelectedEdges();

    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    // Delete selected nodes via batch API
    if (selectedNodes.length > 0) {
        try {
            await api.deleteNodes(selectedNodes);
            if (state.nodesDataSet) {
                state.nodesDataSet.remove(selectedNodes);
            }
        } catch (err) {
            console.error('Failed to batch delete nodes:', err);
        }
    }

    // Delete selected edges if any
    if (selectedEdges.length > 0) {
        selectedEdges.forEach(edgeId => {
            api.deleteEdge(edgeId).catch(console.error);
        });
        if (state.edgesDataSet) {
            state.edgesDataSet.remove(selectedEdges);
        }
    }
}
