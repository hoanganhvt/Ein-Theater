import { state } from '../state.js';
import { LAYER_SCHEMAS, getDefaultParams, getLayerBaseType } from '../schemas.js';
import { esc } from '../utils.js';
import { hideContextMenu } from '../contextMenu.js';
import { openEditEdgeModal } from '../circuit.js';
// ── Edit Layer Parameters Modal ───────────────────────────────────

export function openEditNodeModal(nodeId) {
    if (!state.network || !state.nodesDataSet) return;
    const node = state.nodesDataSet.get(nodeId);
    if (!node) return;

    state.editingNodeId = String(nodeId);
    state.editingLayerType = getLayerBaseType(node);
    const isIntegrated = (state.editingLayerType === 'IntegratedModel' || Boolean(node.params && node.params.model_path));

    const badge = document.getElementById('editLayerTypeBadge');
    if (badge) {
        if (isIntegrated) {
            const mName = (node.params && node.params.model_name) || 'Submodel';
            const instId = String(nodeId).includes('_') ? String(nodeId).split('_').pop() : '';
            badge.textContent = `⚡ Integrated IC Model: ${mName}${instId !== '' ? ' (#' + instId + ')' : ''}`;
        } else {
            const displayName = String(nodeId).replace('_', ' ');
            badge.textContent = `${state.editingLayerType} (${displayName})`;
        }
    }

    const schema = LAYER_SCHEMAS[state.editingLayerType];
    const params = Object.assign({}, schema ? getDefaultParams(state.editingLayerType) : {}, node.params || {});

    const container = document.getElementById('editParamsContainer');
    if (container) {
        container.innerHTML = '';

        if (isIntegrated) {
            // ponytail: integrated model configuration card with coming soon features
            const notice = document.createElement('div');
            notice.style.cssText = 'padding:10px; margin-bottom:12px; background:#eff6ff; color:#1e40af; border-radius:6px; font-size:13px';
            notice.textContent = node.tensorInfo?.message || (node.adaptedModel
                ? 'Inputs have been adapted recursively. Saving creates adapted model subfolders inside the parent model folder.'
                : 'Integrated model dimensions are inferred from its saved canvas.');
            const p = node.params || {};
            const inPorts = (p.inputs || []).map(inp => {
                const s = inp.shape ? (Array.isArray(inp.shape) ? `[${inp.shape.join(', ')}]` : `[${inp.shape}]`) : '';
                return `<li style="margin:4px 0;"><strong>${esc(inp.name || inp.id || 'in')}</strong>: <code>${esc(s)}</code> (${esc(inp.type || 'tensor')})</li>`;
            }).join('') || '<li style="color:#64748b;">(No input ports detected)</li>';

            const outPorts = (p.outputs || []).map(out => {
                const s = out.shape ? (Array.isArray(out.shape) ? `[${out.shape.join(', ')}]` : `[${out.shape}]`) : '';
                return `<li style="margin:4px 0;"><strong>${esc(out.name || out.id || 'out')}</strong>: <code>${esc(s)}</code></li>`;
            }).join('') || '<li style="color:#64748b;">(No output ports detected)</li>';

            container.innerHTML = `
                <div style="background:#f1f5f9; padding:12px; border-radius:8px; margin-bottom:14px; border:1px solid #cbd5e1;">
                    <div style="font-weight:600; color:#0f172a; margin-bottom:6px;">📦 Integrated Model Details</div>
                    <div style="font-size:13px; color:#334155; margin-bottom:4px;"><strong>Name:</strong> ${esc(p.model_name || 'Submodel')}</div>
                    <div style="font-size:12px; color:#64748b; word-break:break-all;"><strong>Path:</strong> <code>${esc(p.model_path || '')}</code></div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
                    <div style="background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #e2e8f0;">
                        <div style="font-size:12px; font-weight:600; color:#0369a1; margin-bottom:4px;">▶ Input Ports &amp; Shapes</div>
                        <ul style="margin:0; padding-left:18px; font-size:12px; color:#334155;">${inPorts}</ul>
                    </div>
                    <div style="background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #e2e8f0;">
                        <div style="font-size:12px; font-weight:600; color:#047857; margin-bottom:4px;">◀ Output Ports &amp; Shapes</div>
                        <ul style="margin:0; padding-left:18px; font-size:12px; color:#334155;">${outPorts}</ul>
                    </div>
                </div>

                <div class="param-group" style="margin-bottom:12px;">
                    <label for="edit_param_weights_path">
                        <span>Pretrained Weights Path</span>
                        <span style="background:#e0e7ff; color:#4338ca; font-size:11px; padding:2px 6px; border-radius:4px; margin-left:6px; font-weight:600;">Coming Soon</span>
                    </label>
                    <input type="text" id="edit_param_weights_path" value="${esc(p.weights_path || '')}" placeholder="e.g. weights/model.pth" class="form-control" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff; color:#1e293b; font-size:13px;">
                </div>

                <div class="param-checkbox-group" style="margin-top:8px;">
                    <input type="checkbox" id="edit_param_freeze_weights" ${p.freeze_weights ? 'checked' : ''}>
                    <label for="edit_param_freeze_weights">
                        <span>Freeze Weights (requires_grad = False)</span>
                        <span style="background:#fef3c7; color:#b45309; font-size:11px; padding:2px 6px; border-radius:4px; margin-left:6px; font-weight:600;">Coming Soon</span>
                    </label>
                </div>
            `;
            container.prepend(notice);
        } else if (schema) {
            if (node.tensorInfo) {
                const notice = document.createElement('div');
                notice.style.cssText = 'padding:10px; margin-bottom:12px; background:#eff6ff; color:#1e40af; border-radius:6px; font-size:13px; white-space:pre-line';
                const info = node.tensorInfo;
                notice.textContent = info.message || [
                    info.input ? `Input tensor: [${info.input.join(', ')}]` : '',
                    info.output ? `Output tensor: [${info.output.join(', ')}]` : (info.outputTree ? `Outputs: ${JSON.stringify(info.outputTree)}` : ''),
                    info.auto?.length ? `Updated automatically from connections: ${info.auto.join(', ')}. These fields are recalculated when you save.` : ''
                ].filter(Boolean).join('\n');
                container.appendChild(notice);
            }
            schema.fields.forEach(f => {
                const val = params[f.key] !== undefined ? params[f.key] : f.default;
                if (f.type === 'boolean') {
                    const group = document.createElement('div');
                    group.className = 'param-checkbox-group';
                    group.innerHTML = `
                        <input type="checkbox" id="edit_param_${f.key}" ${val ? 'checked' : ''}>
                        <label for="edit_param_${f.key}">${esc(f.label)}</label>
                    `;
                    container.appendChild(group);
                } else if (f.type === 'select') {
                    const group = document.createElement('div');
                    group.className = 'param-group';
                    let optionsHtml = '';
                    (f.options || []).forEach(opt => {
                        const optVal = typeof opt === 'object' ? opt.value : opt;
                        const optLabel = typeof opt === 'object' ? opt.label : opt;
                        const isSel = String(optVal) === String(val) ? 'selected' : '';
                        optionsHtml += `<option value="${esc(optVal)}" ${isSel}>${esc(optLabel)}</option>`;
                    });
                    group.innerHTML = `
                        <label for="edit_param_${f.key}">
                            <span>${esc(f.label)}</span>
                        </label>
                        <select id="edit_param_${f.key}" class="form-control" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff; color:#1e293b; font-size:14px;">
                            ${optionsHtml}
                        </select>
                    `;
                    container.appendChild(group);
                } else {
                    const group = document.createElement('div');
                    group.className = 'param-group';
                    const hint = f.min !== undefined ? `min: ${f.min}` : (f.step ? `step: ${f.step}` : '');
                    group.innerHTML = `
                        <label for="edit_param_${f.key}">
                            <span>${esc(f.label)}</span>
                            ${hint ? `<span class="param-hint">${hint}</span>` : ''}
                        </label>
                        <input type="${f.type || 'number'}" id="edit_param_${f.key}" value="${val !== undefined ? esc(String(val)) : ''}"
                               ${f.step !== undefined ? `step="${f.step}"` : ''}
                               ${f.min !== undefined ? `min="${f.min}"` : ''}
                               ${f.max !== undefined ? `max="${f.max}"` : ''}>
                    `;
                    container.appendChild(group);
                }
            });

            // Special dynamic listener for Input block: auto-adjust presets and custom shape
            const itypeSelect = document.getElementById('edit_param_input_type');
            const presetSelect = document.getElementById('edit_param_shape_preset');
            const customShapeInput = document.getElementById('edit_param_custom_shape');
            const dtypeSelect = document.getElementById('edit_param_dtype');

            const MODALITY_PRESETS = {
                'image': [
                    { value: '3, 224, 224', label: '3 × 224 × 224 (Standard ImageNet / ViT)' },
                    { value: '3, 256, 256', label: '3 × 256 × 256 (High-Res Vision)' },
                    { value: '3, 32, 32', label: '3 × 32 × 32 (CIFAR-10 / CIFAR-100)' },
                    { value: '1, 28, 28', label: '1 × 28 × 28 (MNIST Grayscale)' },
                    { value: 'custom', label: 'Custom Shape...' }
                ],
                'text': [
                    { value: '128', label: '128 (Short Sequence)' },
                    { value: '256', label: '256 (Medium Sequence)' },
                    { value: '512', label: '512 (Standard BERT)' },
                    { value: '1024', label: '1024 (Long Context)' },
                    { value: 'custom', label: 'Custom Shape...' }
                ],
                'audio': [
                    { value: '1, 16000', label: '1 × 16,000 (1 sec @ 16 kHz Mono)' },
                    { value: '1, 44100', label: '1 × 44,100 (1 sec @ 44.1 kHz CD Quality)' },
                    { value: '2, 44100', label: '2 × 44,100 (1 sec Stereo)' },
                    { value: 'custom', label: 'Custom Shape...' }
                ],
                'raw data': [
                    { value: '64', label: '64 (Tabular Features)' },
                    { value: '128', label: '128 Features' },
                    { value: '32', label: '32 Features' },
                    { value: '10', label: '10 Features' },
                    { value: 'custom', label: 'Custom Shape...' }
                ]
            };

            const updatePresetOptions = (modality, currentVal) => {
                if (!presetSelect) return;
                const presets = MODALITY_PRESETS[modality] || MODALITY_PRESETS['raw data'];
                presetSelect.innerHTML = presets.map(p =>
                    `<option value="${esc(p.value)}" ${p.value === currentVal ? 'selected' : ''}>${esc(p.label)}</option>`
                ).join('');
            };

            if (itypeSelect && presetSelect && customShapeInput) {
                // Initialize presets on modal open
                updatePresetOptions(itypeSelect.value, presetSelect.value);

                itypeSelect.addEventListener('change', (e) => {
                    const chosen = e.target.value;
                    const presets = MODALITY_PRESETS[chosen] || MODALITY_PRESETS['raw data'];
                    const defaultVal = presets[0].value;
                    updatePresetOptions(chosen, defaultVal);
                    presetSelect.value = defaultVal;
                    customShapeInput.value = defaultVal;

                    if (dtypeSelect) {
                        dtypeSelect.value = (chosen === 'text') ? 'int64' : 'float32';
                    }
                });

                presetSelect.addEventListener('change', (e) => {
                    const sel = e.target.value;
                    if (sel !== 'custom') {
                        customShapeInput.value = sel;
                    } else {
                        customShapeInput.focus();
                    }
                });
            }
        } else {
            // Custom or unlisted layer
            const nameGroup = document.createElement('div');
            nameGroup.className = 'param-group';
            nameGroup.innerHTML = `
                <label for="edit_param_customName">Layer Name</label>
                <input type="text" id="edit_param_customName" value="${esc(state.editingLayerType)}">
            `;
            container.appendChild(nameGroup);

            const argsGroup = document.createElement('div');
            argsGroup.className = 'param-group';
            argsGroup.innerHTML = `
                <label for="edit_param_customArgs">
                    <span>Parameters / Arguments</span>
                    <span class="param-hint">e.g. dim=128, heads=4</span>
                </label>
                <input type="text" id="edit_param_customArgs" value="${esc(params.customArgs || '')}" placeholder="e.g. dim=128, bias=True">
            `;
            container.appendChild(argsGroup);
        }
    }

    const overlay = document.getElementById('modalOverlay');
    const editModal = document.getElementById('editLayerModal');
    if (overlay) overlay.style.display = 'block';
    if (editModal) editModal.style.display = 'block';
}

export function closeEditModal() {
    const modal = document.getElementById('editLayerModal');
    if (modal) modal.style.display = 'none';
    const overlay = document.getElementById('modalOverlay');
    const nodeModal = document.getElementById('nodeModal');
    const folderModal = document.getElementById('selectFolderModal');
    if (overlay && (!nodeModal || nodeModal.style.display !== 'block') && (!folderModal || folderModal.style.display !== 'block')) {
        overlay.style.display = 'none';
    }
    state.editingNodeId = null;
    state.editingLayerType = null;
}

export function openEditNodeFromContext() {
    hideContextMenu();
    if (!state.network) return;

    // Prioritize specifically clicked or selected edge
    if (state.contextClickedEdge) {
        openEditEdgeModal(state.contextClickedEdge);
        return;
    }

    const selEdges = state.network.getSelectedEdges();
    const selNodes = state.network.getSelectedNodes();

    if (selNodes && selNodes.length === 1 && (!selEdges || selEdges.length === 0)) {
        openEditNodeModal(selNodes[0]);
    } else if (selEdges && selEdges.length === 1) {
        openEditEdgeModal(selEdges[0]);
    } else if (selNodes && selNodes.length === 1) {
        openEditNodeModal(selNodes[0]);
    }
}
