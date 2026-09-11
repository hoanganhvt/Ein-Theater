// ── Canvas Interaction Modes (Move, Select, Add Node, Add Edge) ───
import { state } from './state.js';
import { cancelWireCreation } from './circuit.js';
import { openAddNodeModal } from './modals.js';

export function setMode(mode) {
    state.currentMode = mode;

    if (mode !== 'connect') {
        cancelWireCreation();
    }

    // Update toolbar button states
    const btnMove = document.getElementById('btnModeMove');
    const btnSelect = document.getElementById('btnModeSelect');
    const btnAdd = document.getElementById('btnModeAdd');
    const btnConnect = document.getElementById('btnModeConnect');
    if (btnMove) btnMove.classList.toggle('active', mode === 'move');
    if (btnSelect) btnSelect.classList.toggle('active', mode === 'select');
    if (btnAdd) btnAdd.classList.toggle('active', mode === 'add');
    if (btnConnect) btnConnect.classList.toggle('active', mode === 'connect');

    // Update checkmarks in context menu
    const checkMove = document.getElementById('cmCheckMove');
    const checkSelect = document.getElementById('cmCheckSelect');
    const checkAdd = document.getElementById('cmCheckAdd');
    const checkConnect = document.getElementById('cmCheckConnect');
    if (checkMove) checkMove.textContent = mode === 'move' ? '✓' : '';
    if (checkSelect) checkSelect.textContent = mode === 'select' ? '✓' : '';
    if (checkAdd) checkAdd.textContent = mode === 'add' ? '✓' : '';
    if (checkConnect) checkConnect.textContent = mode === 'connect' ? '✓' : '';

    const banner = document.getElementById('modeBanner');
    const container = document.getElementById('mynetwork');

    if (!state.network) return;

    if (mode === 'move') {
        state.network.disableEditMode();
        state.network.setOptions({
            interaction: {
                dragView: true,
                dragNodes: true
            },
            edges: {
                color: {
                    color:     'rgba(0,0,0,0)',
                    highlight: 'rgba(0,0,0,0)',
                    hover:     'rgba(0,0,0,0)',
                    inherit:   false,
                    opacity:   0
                },
                width: 10
            }
        });
        if (banner) banner.style.display = 'none';
        if (container) container.style.cursor = '';
    } else if (mode === 'select') {
        state.network.disableEditMode();
        state.network.setOptions({
            interaction: {
                dragView: false,
                dragNodes: false
            },
            edges: {
                color: {
                    color:     'rgba(0,0,0,0)',
                    highlight: 'rgba(0,0,0,0)',
                    hover:     'rgba(0,0,0,0)',
                    inherit:   false,
                    opacity:   0
                },
                width: 10
            }
        });
        if (banner) {
            banner.innerHTML = '<span>⬚ <strong>Select</strong> — Drag on canvas to select multiple blocks. Click <strong>Move</strong> or press <strong>Esc</strong> to exit.</span>';
            banner.style.display = 'block';
        }
        if (container) container.style.cursor = 'crosshair';
    } else if (mode === 'connect') {
        cancelWireCreation();
        state.network.disableEditMode();
        state.network.setOptions({
            interaction: {
                dragView: false,
                dragNodes: false
            },
            edges: {
                color: {
                    color:     'rgba(0,0,0,0)',
                    highlight: 'rgba(0,0,0,0)',
                    hover:     'rgba(0,0,0,0)',
                    inherit:   false,
                    opacity:   0
                },
                width: 10
            }
        });
        if (banner) {
            banner.innerHTML = '<span>🔗 <strong>Add Edge</strong> — Click a block to start wire, click/drag on grid to add corners (<strong>Space</strong> to flip bend), click target block to connect. <strong>Esc</strong> to cancel.</span>';
            banner.style.display = 'block';
        }
        if (container) container.style.cursor = 'crosshair';
    } else if (mode === 'add') {
        state.network.disableEditMode();
        state.network.setOptions({
            interaction: {
                dragView: false,
                dragNodes: false
            },
            edges: {
                color: {
                    color:     'rgba(0,0,0,0)',
                    highlight: 'rgba(0,0,0,0)',
                    hover:     'rgba(0,0,0,0)',
                    inherit:   false,
                    opacity:   0
                },
                width: 10
            }
        });
        if (banner) {
            banner.innerHTML = '<span>➕ <strong>Add Node</strong> — Click anywhere on canvas to place a block. Click <strong>Move</strong> or press <strong>Esc</strong> to exit.</span>';
            banner.style.display = 'block';
        }
        if (container) container.style.cursor = 'copy';
    }
}

export function setupCanvasClickAdd() {
    const container = document.getElementById('mynetwork');
    if (!container) return;

    container.addEventListener('click', (e) => {
        if (state.currentMode !== 'add') return;
        if (!state.network) return;

        // Ignore clicks on modals or context menu
        if (e.target.closest('#contextMenu') || e.target.closest('#nodeModal') || e.target.closest('#modalOverlay') || e.target.closest('#editLayerModal') || e.target.closest('#selectFolderModal')) return;

        const rect = container.getBoundingClientRect();
        const domX = e.clientX - rect.left;
        const domY = e.clientY - rect.top;

        // If clicked on an existing node, don't open modal
        const nodeAt = state.network.getNodeAt({ x: domX, y: domY });
        if (nodeAt) return;

        const canvasPos = state.network.DOMtoCanvas({ x: domX, y: domY });
        openAddNodeModal({
            x: Math.round(canvasPos.x),
            y: Math.round(canvasPos.y)
        });
    });
}
