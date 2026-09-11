// ── Clipboard System (Copy, Cut, Paste, Select All) ────────────────
// Enables copying/pasting single blocks or multi-block collections
// with internal circuit wire connections, exact hyperparameters,
// grid snapping, and cross-project session persistence.

import { state } from './state.js';
import { api } from './api.js';
import { showToast } from './workspace.js';
import { getNodeDisplayName, getDefaultParams, LAYER_SCHEMAS } from './schemas.js';
import { snapToGrid } from './circuit.js';
import { setMode } from './modes.js';

const STORAGE_KEY = 'ein_theater_clipboard';

// In-memory clipboard cache
let _clipboard = null;
let _pasteCount = 0;

// Initialize clipboard from sessionStorage if available
try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
            _clipboard = parsed;
        }
    }
} catch (_) {}

/** Returns true if valid copied blocks are present in clipboard. */
export function hasClipboardData() {
    if (_clipboard && Array.isArray(_clipboard.nodes) && _clipboard.nodes.length > 0) {
        return true;
    }
    try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
                _clipboard = parsed;
                return true;
            }
        }
    } catch (_) {}
    return false;
}

/** Returns the count of blocks currently copied in clipboard. */
export function getClipboardNodeCount() {
    if (hasClipboardData()) {
        return _clipboard.nodes.length;
    }
    return 0;
}

/**
 * Copies the currently selected node(s) and any internal edges connecting them.
 * Stores deep copies of parameters, layer types, and relative layout.
 */
export function copySelection() {
    if (!state.network || !state.nodesDataSet) {
        showToast('Please select one or more blocks to copy');
        return false;
    }

    const selectedNodeIds = (state.network.getSelectedNodes() || []).map(String);
    if (selectedNodeIds.length === 0) {
        showToast('Please select one or more blocks to copy');
        return false;
    }

    const nodeSet = new Set(selectedNodeIds);
    const nodesToCopy = [];

    selectedNodeIds.forEach(id => {
        const node = state.nodesDataSet.get(id);
        if (node) {
            nodesToCopy.push({
                id: String(node.id),
                label: node.label || '',
                layerType: node.layerType || (node.label || '').split('\n')[0].trim(),
                params: node.params ? JSON.parse(JSON.stringify(node.params)) : {},
                shape: node.shape || 'box',
                color: node.color || '',
                x: typeof node.x === 'number' ? node.x : 0,
                y: typeof node.y === 'number' ? node.y : 0,
                parent: node.parent || '',
                parentZone: node.parentZone || ''
            });
        }
    });

    // Capture internal edges between selected nodes
    const edgesToCopy = [];
    if (state.edgesDataSet) {
        state.edgesDataSet.get().forEach(e => {
            if (nodeSet.has(String(e.from)) && nodeSet.has(String(e.to))) {
                edgesToCopy.push({
                    from: String(e.from),
                    to: String(e.to),
                    lines: e.lines ? JSON.parse(JSON.stringify(e.lines)) : [],
                    foldMode: e.foldMode || 'horizontal',
                    customFold: e.customFold !== undefined ? e.customFold : null,
                    edgeType: e.edgeType || ''
                });
            }
        });
    }

    _clipboard = {
        nodes: nodesToCopy,
        edges: edgesToCopy,
        copiedAt: Date.now()
    };
    _pasteCount = 0;

    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_clipboard));
    } catch (_) {}

    updateClipboardUI();

    const nLen = nodesToCopy.length;
    const eLen = edgesToCopy.length;
    const wireText = eLen > 0 ? ` and ${eLen} ${eLen === 1 ? 'wire' : 'wires'}` : '';
    const nameText = nLen === 1 ? ` (${nodesToCopy[0].label || nodesToCopy[0].layerType})` : '';
    showToast(`📋 Copied ${nLen} ${nLen === 1 ? 'block' : 'blocks'}${nameText}${wireText}`);
    return true;
}

/**
 * Cuts the currently selected node(s) and internal edges (copies then deletes).
 */
export async function cutSelection() {
    const copied = copySelection();
    if (!copied) return;

    const { deleteSelectionFromContextMenu } = await import('./contextMenu.js');
    await deleteSelectionFromContextMenu();

    const nLen = _clipboard ? _clipboard.nodes.length : 0;
    showToast(`✂️ Cut ${nLen} ${nLen === 1 ? 'block' : 'blocks'}`);
}

/**
 * Pastes clipboard elements into the active model graph.
 * @param {{x: number, y: number}|null} targetPos - Optional canvas coordinate to center pasted nodes at.
 */
export async function pasteClipboard(targetPos = null) {
    if (!hasClipboardData()) {
        showToast('Clipboard is empty. Select a block and press Ctrl+C to copy.');
        return;
    }
    if (!state.network || !state.nodesDataSet) return;

    const { nodes, edges } = _clipboard;
    if (!nodes || nodes.length === 0) return;

    let dx = 0;
    let dy = 0;

    if (targetPos && typeof targetPos.x === 'number' && typeof targetPos.y === 'number') {
        // Place bounding box center of pasted collection at targetPos
        const xs = nodes.map(n => n.x);
        const ys = nodes.map(n => n.y);
        const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
        const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

        const snappedTarget = snapToGrid(targetPos.x, targetPos.y);
        const snappedCenter = snapToGrid(centerX, centerY);

        dx = snappedTarget.x - snappedCenter.x;
        dy = snappedTarget.y - snappedCenter.y;
    } else {
        // Staggered offset for keyboard shortcut or toolbar Paste
        _pasteCount++;
        const offsetDist = 50 * _pasteCount;

        const viewPos = state.network.getViewPosition ? state.network.getViewPosition() : { x: 0, y: 0 };
        const xs = nodes.map(n => n.x);
        const ys = nodes.map(n => n.y);
        const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
        const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

        // If clipboard nodes are far from current camera view (e.g. user panned or switched models),
        // center them near the camera view center
        const distFromView = Math.hypot(centerX - viewPos.x, centerY - viewPos.y);
        if (distFromView > 1200) {
            const snappedView = snapToGrid(viewPos.x, viewPos.y);
            const snappedCenter = snapToGrid(centerX, centerY);
            dx = (snappedView.x - snappedCenter.x) + 50 * ((_pasteCount - 1) % 5);
            dy = (snappedView.y - snappedCenter.y) + 50 * ((_pasteCount - 1) % 5);
        } else {
            dx = offsetDist;
            dy = offsetDist;
        }
    }

    try {
        const resp = await api.pasteGraph(nodes, edges, dx, dy);
        if (!resp || !resp.nodes || resp.nodes.length === 0) {
            showToast('Failed to paste: server returned no nodes');
            return;
        }

        // Format created nodes for Vis.js DataSet
        const processedNodes = resp.nodes.map(n => {
            const baseType = n.layerType || (n.label || '').split('\n')[0].trim();
            const params = n.params || (LAYER_SCHEMAS[baseType] ? getDefaultParams(baseType) : {});
            const displayName = getNodeDisplayName(n);
            return {
                ...n,
                id: String(n.id),
                label: displayName,
                title: displayName,
                layerType: baseType,
                params: params,
                shape: n.shape || 'box'
            };
        });

        // Format created edges for Vis.js DataSet
        const processedEdges = (resp.edges || []).map((e, idx) => {
            const origEdge = edges[idx] || {};
            return {
                ...e,
                id: String(e.id),
                from: String(e.from),
                to: String(e.to),
                lines: e.lines || [],
                foldMode: origEdge.foldMode || 'horizontal',
                customFold: origEdge.customFold !== undefined ? origEdge.customFold : null,
                color: {
                    color:     'rgba(0,0,0,0)',
                    highlight: 'rgba(0,0,0,0)',
                    hover:     'rgba(0,0,0,0)',
                    inherit:   false,
                    opacity:   0
                },
                width: 10
            };
        });

        state.nodesDataSet.add(processedNodes);
        if (processedEdges.length > 0 && state.edgesDataSet) {
            state.edgesDataSet.add(processedEdges);
        }

        const newIds = processedNodes.map(n => String(n.id));
        const newEdgeIds = processedEdges.map(e => String(e.id));

        // 1. Check if elements have truly been added to the dataset
        const verifiedNodeIds = newIds.filter(id => Boolean(state.nodesDataSet.get(id)));
        if (verifiedNodeIds.length === 0) {
            showToast('Warning: Pasted blocks could not be verified on canvas');
            return;
        }

        // 2. Automatically switch to move mode so user can immediately drag and reposition
        setMode('move');

        // 3. Keep all the newly pasted blocks and connecting wires selected
        state.network.setSelection({ nodes: verifiedNodeIds, edges: newEdgeIds });
        state.network.redraw();

        updateClipboardUI();

        const nLen = verifiedNodeIds.length;
        const eLen = processedEdges.length;
        const wireText = eLen > 0 ? ` and ${eLen} ${eLen === 1 ? 'wire' : 'wires'}` : '';
        const namePreview = nLen === 1 ? ` (${processedNodes[0].label})` : '';
        showToast(`📥 Pasted ${nLen} ${nLen === 1 ? 'block' : 'blocks'}${namePreview}${wireText}`);
    } catch (err) {
        console.error('Failed to paste graph:', err);
        showToast('Error pasting: ' + err.message);
    }
}

/** Pastes clipboard at the right-click context menu position. */
export async function pasteClipboardAtContext() {
    if (state.contextClickPos) {
        await pasteClipboard(state.contextClickPos);
    } else {
        await pasteClipboard();
    }
}

/** Selects all nodes on the active canvas. */
export function selectAllNodes() {
    if (!state.network || !state.nodesDataSet) return;
    const allIds = state.nodesDataSet.getIds();
    if (allIds && allIds.length > 0) {
        state.network.selectNodes(allIds);
        updateClipboardUI();
    }
}

/** Updates button styling and disabled states across toolbar and menus. */
export function updateClipboardUI() {
    const hasSelection = state.network && state.network.getSelectedNodes().length > 0;
    const hasAnySelection = hasSelection || (state.network && state.network.getSelectedEdges().length > 0);
    const hasClip = hasClipboardData();

    const btnCopy = document.getElementById('btnCopySelection');
    if (btnCopy) {
        btnCopy.classList.toggle('disabled', !hasSelection);
        if (hasSelection) {
            btnCopy.removeAttribute('disabled');
        } else {
            btnCopy.setAttribute('disabled', 'true');
        }
    }

    const btnPaste = document.getElementById('btnPasteClipboard');
    if (btnPaste) {
        btnPaste.classList.toggle('disabled', !hasClip);
        if (hasClip) {
            btnPaste.removeAttribute('disabled');
        } else {
            btnPaste.setAttribute('disabled', 'true');
        }
    }

    const btnDelete = document.getElementById('btnDeleteSelection');
    if (btnDelete) {
        btnDelete.classList.toggle('disabled', !hasAnySelection);
    }
}

/**
 * Registers global keyboard shortcuts:
 * - Ctrl+C / Cmd+C: Copy selected node(s) and internal edges
 * - Ctrl+V / Cmd+V: Paste copied elements
 * - Ctrl+X / Cmd+X: Cut selected node(s) and internal edges
 * - Ctrl+A / Cmd+A: Select all nodes
 */
export function setupClipboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        // If user is editing inside a form field, let standard browser copy/paste take place
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        // If any modal dialog is currently visible, do not intercept canvas shortcuts
        const overlay = document.getElementById('modalOverlay');
        if (overlay && overlay.style.display === 'block') return;

        const isCtrl = e.ctrlKey || e.metaKey;
        if (!isCtrl) return;

        const key = e.key.toLowerCase();
        if (key === 'c') {
            const hasSel = state.network && state.network.getSelectedNodes().length > 0;
            if (hasSel) {
                e.preventDefault();
                copySelection();
            }
        } else if (key === 'v') {
            if (hasClipboardData()) {
                e.preventDefault();
                pasteClipboard();
            }
        } else if (key === 'x') {
            const hasSel = state.network && state.network.getSelectedNodes().length > 0;
            if (hasSel) {
                e.preventDefault();
                cutSelection();
            }
        } else if (key === 'a') {
            if (state.nodesDataSet && state.nodesDataSet.length > 0) {
                e.preventDefault();
                selectAllNodes();
            }
        }
    });

    // Update UI on initial boot
    updateClipboardUI();
}
