import { state } from '../state.js';
import { cancelWireCreation, updateConnectBanner } from '../circuit.js';
export function setMode(mode) {
    state.currentMode = mode;

    if (mode !== 'connect') {
        cancelWireCreation();
    }

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
            updateConnectBanner();
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
