// ── Drag & Drop / Click from Sidebar Palette to Canvas ────────────
import { state } from './state.js';
import { createBlock } from './graph.js';
import { MODULES_LIST } from './schemas.js';
import { esc } from './utils.js';

let canvasListenersInitialized = false;

/**
 * Dynamically renders the sidebar layer palette from MODULES_LIST
 * and binds drag-and-drop / click-to-add listeners.
 */
export function renderPalette() {
    const paletteList = document.getElementById('paletteList');
    if (!paletteList) return;

    let html = '';
    MODULES_LIST.forEach(mod => {
        html += `
            <div class="palette-item" draggable="true" data-type="${esc(mod.type)}" title="Drag &amp; drop onto canvas or click to add">
                <span class="palette-badge ${esc(mod.badgeClass || 'badge-blue')}">${esc(mod.badge || 'layer')}</span>
                <span class="palette-name">${esc(mod.name || mod.type)}</span>
                <span class="drag-handle">⋮⋮</span>
            </div>`;
    });

    html += `
        <div class="palette-item custom-palette-item" onclick="openAddNodeModal()" title="Open modal to create custom block">
            <span class="palette-badge badge-gray">custom</span>
            <span class="palette-name">+ Custom Layer...</span>
        </div>`;

    paletteList.innerHTML = html;
    setupPaletteDragAndDrop();
}

export function setupPaletteDragAndDrop() {
    const paletteItems = document.querySelectorAll('.palette-item[draggable="true"]');
    const canvasContainer = document.getElementById('mynetwork');
    if (!canvasContainer) return;

    paletteItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            const blockType = item.getAttribute('data-type');
            e.dataTransfer.setData('text/plain', blockType);
            e.dataTransfer.effectAllowed = 'copy';
            item.classList.add('dragging');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        // Click to add at center as a quick alternative to drag & drop
        item.addEventListener('click', () => {
            const blockType = item.getAttribute('data-type');
            if (state.network) {
                const v = state.network.getViewPosition();
                const posX = Math.round(v.x + (Math.random() * 80 - 40));
                const posY = Math.round(v.y + (Math.random() * 80 - 40));
                createBlock(blockType, posX, posY);
            }
        });
    });

    if (canvasListenersInitialized) return;
    canvasListenersInitialized = true;

    canvasContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        canvasContainer.classList.add('drag-over');
    });

    canvasContainer.addEventListener('dragleave', (e) => {
        if (!canvasContainer.contains(e.relatedTarget)) {
            canvasContainer.classList.remove('drag-over');
        }
    });

    canvasContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        canvasContainer.classList.remove('drag-over');

        const blockType = e.dataTransfer.getData('text/plain');
        if (!blockType || !state.network) return;

        // Convert DOM coordinates to Vis.js canvas coordinates
        const rect = canvasContainer.getBoundingClientRect();
        const domPos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        const canvasPos = state.network.DOMtoCanvas(domPos);

        const posX = Math.round(canvasPos.x);
        const posY = Math.round(canvasPos.y);

        await createBlock(blockType, posX, posY);
    });
}
