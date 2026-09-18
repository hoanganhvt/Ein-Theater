import { MODULES_LIST, LAYER_SCHEMAS, getDefaultParams, formatNodeLabel } from '../schemas.js';
import { esc } from '../utils.js';
import { toggleCustom } from './add.js';
// ── Add Block Modal ───────────────────────────────────────────────

export const CATEGORY_DEFINITIONS = [
    { id: 'all', label: 'All Categories' },
    { id: 'conv', label: 'Convolutional' },
    { id: 'dense', label: 'Dense & Linear' },
    { id: 'activation', label: 'Non-linear Activations' },
    { id: 'pooling', label: 'Pooling Layers' },
    { id: 'normalization', label: 'Normalization' },
    { id: 'padding', label: 'Padding Layers' },
    { id: 'regularization', label: 'Dropout & Regularization' },
    { id: 'recurrent', label: 'Recurrent (RNN / LSTM / GRU)' },
    { id: 'transformer', label: 'Transformer & Attention' },
    { id: 'embedding', label: 'Embeddings' },
    { id: 'vision', label: 'Vision & Resizing' },
    { id: 'loss', label: 'Loss Functions' },
    { id: 'distance', label: 'Distance & Similarity' },
    { id: 'utility', label: 'Shape Operations' },
    { id: 'custom', label: 'Custom Layer...' }
];

export function populateCategoryDropdown() {
    const select = document.getElementById('nodeCategory');
    if (!select) return;

    // Count modules per category
    const counts = {};
    MODULES_LIST.forEach(m => {
        const cat = m.category || 'other';
        counts[cat] = (counts[cat] || 0) + 1;
    });

    const currentVal = select.value || 'all';
    let html = '';
    CATEGORY_DEFINITIONS.forEach(cat => {
        let countText = '';
        if (cat.id === 'all') {
            countText = ` (${MODULES_LIST.length})`;
        } else if (cat.id !== 'custom' && counts[cat.id]) {
            countText = ` (${counts[cat.id]})`;
        }
        html += `<option value="${esc(cat.id)}">${esc(cat.label)}${countText}</option>`;
    });

    select.innerHTML = html;
    if (currentVal && Array.from(select.options).some(opt => opt.value === currentVal)) {
        select.value = currentVal;
    }
}

export function populateNodeTypeDropdown(category = 'all', searchQuery = '') {
    const select = document.getElementById('nodeType');
    if (!select) return;

    const query = searchQuery.trim().toLowerCase();
    let filtered = MODULES_LIST;

    if (category !== 'all' && category !== 'custom') {
        filtered = filtered.filter(m => (m.category || '').toLowerCase() === category.toLowerCase());
    }

    if (query) {
        filtered = filtered.filter(m => {
            const t = (m.type || '').toLowerCase();
            const n = (m.name || '').toLowerCase();
            const c = (m.category || '').toLowerCase();
            const b = (m.badge || '').toLowerCase();
            return t.includes(query) || n.includes(query) || c.includes(query) || b.includes(query);
        });
    }

    let html = '';
    if (category === 'all' && !query) {
        // Group by category with optgroups
        const groups = {};
        filtered.forEach(mod => {
            const catId = mod.category || 'other';
            if (!groups[catId]) groups[catId] = [];
            groups[catId].push(mod);
        });

        CATEGORY_DEFINITIONS.forEach(cat => {
            if (cat.id === 'all' || cat.id === 'custom') return;
            const items = groups[cat.id];
            if (items && items.length > 0) {
                html += `<optgroup label="${esc(cat.label)}">`;
                items.forEach(mod => {
                    html += `<option value="${esc(mod.type)}">${esc(mod.type)}</option>`;
                });
                html += `</optgroup>`;
            }
        });
    } else {
        filtered.forEach(mod => {
            html += `<option value="${esc(mod.type)}">${esc(mod.type)}</option>`;
        });
    }

    html += `<option value="custom"> Custom Layer...</option>`;
    select.innerHTML = html;

    if (category === 'custom') {
        select.value = 'custom';
    } else if (filtered.length > 0) {
        select.value = filtered[0].type;
    } else {
        select.value = 'custom';
    }

    toggleCustom();
    updateNodePreview();
}

export function updateNodePreview() {
    const select = document.getElementById('nodeType');
    const badgeEl = document.getElementById('nodePreviewBadge');
    const catEl = document.getElementById('nodePreviewCategory');
    const labelEl = document.getElementById('nodePreviewLabel');
    const codeEl = document.getElementById('nodePreviewCode');
    const card = document.getElementById('nodePreviewCard');
    if (!select || !card) return;

    const chosenType = select.value;
    if (chosenType === 'custom') {
        if (badgeEl) {
            badgeEl.className = 'palette-badge badge-gray';
            badgeEl.textContent = 'custom';
        }
        if (catEl) catEl.textContent = 'Custom Block';
        if (labelEl) labelEl.textContent = 'Custom Layer (User-defined)';
        if (codeEl) codeEl.textContent = 'CustomModule(...)';
        return;
    }

    const schema = LAYER_SCHEMAS[chosenType];
    if (!schema) {
        if (badgeEl) {
            badgeEl.className = 'palette-badge badge-blue';
            badgeEl.textContent = 'layer';
        }
        if (catEl) catEl.textContent = 'Neural Block';
        if (labelEl) labelEl.textContent = chosenType;
        if (codeEl) codeEl.textContent = `${chosenType}()`;
        return;
    }

    if (badgeEl) {
        badgeEl.className = `palette-badge ${schema.badgeClass || 'badge-blue'}`;
        badgeEl.textContent = schema.badge || 'layer';
    }
    if (catEl) {
        const def = CATEGORY_DEFINITIONS.find(c => c.id === schema.category);
        catEl.textContent = def ? def.label : (schema.category || 'Layer');
    }
    if (labelEl) {
        const sampleLabel = formatNodeLabel(chosenType, getDefaultParams(chosenType));
        labelEl.textContent = sampleLabel;
    }
    if (codeEl) {
        codeEl.textContent = schema.code || `${chosenType}()`;
    }
}
