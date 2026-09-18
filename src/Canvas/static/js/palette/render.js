import { MODULES_LIST, LAYER_SCHEMAS } from '../schemas.js';
import { esc } from '../utils.js';
import { setupPaletteDragAndDrop } from './dragging.js';
import { FUNDAMENTAL_LAYERS } from './catalog.js';
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
