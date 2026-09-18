import { state } from '../state.js';
import { setMode } from '../modes.js';
import { closeAllModals } from '../modals.js';
import { getEdgeAtCanvasPos } from '../circuit.js';
import { hasClipboardData, getClipboardNodeCount } from '../clipboard.js';
import { deleteSelectionFromContextMenu } from './deletion.js';
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
        const clickedEdge = (!clickedNode ? getEdgeAtCanvasPos(state.contextClickPos, 14) : null) || state.network.getEdgeAt({ x: domX, y: domY });
        let currentSelected = state.network.getSelectedNodes();
        let currentSelectedEdges = state.network.getSelectedEdges();

        if (clickedNode) {
            state.contextClickedEdge = null;
            // If right-clicked node is not in current multi-selection, select only it
            if (!currentSelected.includes(clickedNode)) {
                state.network.selectNodes([clickedNode]);
                currentSelected = [clickedNode];
            }
        } else if (clickedEdge) {
            state.contextClickedEdge = String(clickedEdge);
            state.network.setSelection({ nodes: [], edges: [String(clickedEdge)] });
            currentSelectedEdges = [String(clickedEdge)];
            currentSelected = [];
            state.network.redraw();
        } else {
            state.contextClickedEdge = null;
        }

        const count = currentSelected.length;
        const edgeCount = currentSelectedEdges.length;
        const cmEdit = document.getElementById('cmEdit');
        const cmCopy = document.getElementById('cmCopy');
        const cmCopyText = document.getElementById('cmCopyText');
        const cmPaste = document.getElementById('cmPaste');
        const cmPasteText = document.getElementById('cmPasteText');
        const cmDelete = document.getElementById('cmDelete');
        const cmDeleteText = document.getElementById('cmDeleteText');
        const cmInvertFold = document.getElementById('cmInvertFold');

        if (cmInvertFold) {
            if (edgeCount === 1 || clickedEdge) {
                cmInvertFold.style.display = 'flex';
            } else {
                cmInvertFold.style.display = 'none';
            }
        }
        if (cmEdit) {
            cmEdit.style.display = 'flex';
            const isSingleEdge = (count === 0 && (edgeCount === 1 || clickedEdge));
            const isSingleNode = (count === 1 && !clickedEdge);
            const cmEditText = document.getElementById('cmEditText') || cmEdit.querySelector('.cm-text');
            if (isSingleEdge) {
                cmEdit.classList.remove('disabled');
                if (cmEditText) cmEditText.textContent = 'Edit Connection';
            } else if (isSingleNode) {
                cmEdit.classList.remove('disabled');
                if (cmEditText) cmEditText.textContent = 'Edit Parameters';
            } else {
                cmEdit.classList.add('disabled');
                if (cmEditText) cmEditText.textContent = 'Edit';
            }
        }

        if (cmCopy) {
            cmCopy.style.display = 'flex';
            if (count > 0) {
                cmCopy.classList.remove('disabled');
                cmCopyText.textContent = count > 1 ? `Copy (${count} blocks)` : 'Copy';
            } else {
                cmCopy.classList.add('disabled');
                cmCopyText.textContent = 'Copy';
            }
        }

        if (cmPaste) {
            cmPaste.style.display = 'flex';
            if (hasClipboardData()) {
                cmPaste.classList.remove('disabled');
                const clipCount = getClipboardNodeCount();
                const isBlank = (!clickedNode && !clickedEdge);
                if (isBlank) {
                    cmPasteText.textContent = clipCount > 1 ? `Paste Here (${clipCount} blocks)` : 'Paste Here';
                } else {
                    cmPasteText.textContent = clipCount > 1 ? `Paste (${clipCount} blocks)` : 'Paste';
                }
            } else {
                cmPaste.classList.add('disabled');
                cmPasteText.textContent = 'Paste';
            }
        }

        if (cmDelete) {
            cmDelete.style.display = 'flex';
            if (count > 0 || edgeCount > 0) {
                cmDelete.classList.remove('disabled');
                if (count > 0) {
                    cmDeleteText.textContent = count > 1 ? `Delete (${count} blocks)` : 'Delete';
                } else {
                    cmDeleteText.textContent = edgeCount > 1 ? `Delete (${edgeCount} wires)` : 'Delete Wire';
                }
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
