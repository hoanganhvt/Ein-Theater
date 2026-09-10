// ── Context Menu (Right-Click Menu & Selection Deletion) ─────────
import { state } from './state.js';
import { api } from './api.js';
import { setMode } from './modes.js';
import { closeAllModals } from './modals.js';
import { getEdgeAtCanvasPos } from './circuit.js';

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
            if (count === 1) {
                cmEdit.classList.remove('disabled');
            } else {
                cmEdit.classList.add('disabled');
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

export async function deleteSelectionFromContextMenu() {
    hideContextMenu();
    if (!state.network) return;

    const selectedNodes = (state.network.getSelectedNodes() || []).map(String);
    let selectedEdges = (state.network.getSelectedEdges() || []).map(String);

    if (selectedEdges.length === 0 && state.contextClickedEdge) {
        selectedEdges = [String(state.contextClickedEdge)];
    }
    state.contextClickedEdge = null;

    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    // Delete selected nodes via batch API and clean up connected edges in frontend
    if (selectedNodes.length > 0) {
        try {
            await api.deleteNodes(selectedNodes);
            if (state.edgesDataSet) {
                const nodeSet = new Set(selectedNodes);
                const connectedEdges = state.edgesDataSet.get().filter(
                    e => nodeSet.has(String(e.from)) || nodeSet.has(String(e.to))
                );
                if (connectedEdges.length > 0) {
                    state.edgesDataSet.remove(connectedEdges.map(e => e.id));
                }
            }
            if (state.nodesDataSet) {
                state.nodesDataSet.remove(selectedNodes);
            }
        } catch (err) {
            console.error('Failed to batch delete nodes:', err);
        }
    }

    // Delete selected edges if any
    if (selectedEdges.length > 0) {
        for (const edgeId of selectedEdges) {
            try {
                await api.deleteEdge(edgeId);
            } catch (err) {
                console.error(`Failed to delete edge ${edgeId}:`, err);
            }
        }
        if (state.edgesDataSet) {
            state.edgesDataSet.remove(selectedEdges);
        }
    }

    if (state.network) {
        state.network.unselectAll();
        state.network.redraw();
    }
}
