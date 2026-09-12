// ── Drag & Drop / Click from Sidebar Palette to Canvas ────────────
import { state } from './state.js';
import { createBlock } from './graph.js';
import { MODULES_LIST, LAYER_SCHEMAS } from './schemas.js';
import { esc } from './utils.js';
import { openAddNodeModal } from './modals.js';
import { setMode } from './modes.js';

let canvasListenersInitialized = false;

// The fundamental PyTorch building blocks + Input source block
export const FUNDAMENTAL_LAYERS = [
    'Input',
    'nn.Linear',
    'nn.Conv2d',
    'nn.ReLU',
    'nn.MaxPool2d',
    'nn.BatchNorm2d',
    'nn.LayerNorm',
    'nn.Dropout',
    'nn.LSTM',
    'nn.MultiheadAttention',
    'nn.Embedding'
];

/**
 * Dynamically renders the 10 fundamental PyTorch blocks in the sidebar palette.
 */
export function renderPalette() {
    const paletteList = document.getElementById('paletteList');
    if (!paletteList) return;

    let html = '';

    FUNDAMENTAL_LAYERS.forEach(type => {
        const mod = LAYER_SCHEMAS[type] || MODULES_LIST.find(m => m.type === type);
        if (mod) {
            html += `
                <div class="palette-item" draggable="true" data-type="${esc(mod.type)}" title="Drag &amp; drop onto canvas or click to add">
                    <span class="palette-badge ${esc(mod.badgeClass || 'badge-blue')}">${esc(mod.badge || 'layer')}</span>
                    <span class="palette-name">${esc(mod.name || mod.type)}</span>
                    <span class="drag-handle">⋮⋮</span>
                </div>`;
        }
    });

    html += `
        <div class="palette-item custom-palette-item" onclick="openAddNodeModal()" title="Browse all 150+ PyTorch modules or create custom block">
            <span class="palette-badge badge-gray">+</span>
            <span class="palette-name">+ More / Custom...</span>
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
        item.addEventListener('click', async () => {
            const blockType = item.getAttribute('data-type');
            if (state.network) {
                const v = state.network.getViewPosition();
                const posX = Math.round(v.x + (Math.random() * 80 - 40));
                const posY = Math.round(v.y + (Math.random() * 80 - 40));
                const nodeObj = await createBlock(blockType, posX, posY);
                if (nodeObj && nodeObj.id) {
                    setMode('move');
                    state.network.selectNodes([String(nodeObj.id)]);
                    state.network.redraw();
                }
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

        const nodeObj = await createBlock(blockType, posX, posY);
        if (nodeObj && nodeObj.id) {
            setMode('move');
            state.network.selectNodes([String(nodeObj.id)]);
            state.network.redraw();
        }
    });
}
