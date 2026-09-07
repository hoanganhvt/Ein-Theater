// ── Box Selection (Rubber-band Selection in Select Mode or Shift+Drag)
import { state } from './state.js';

export function setupBoxSelection() {
    const container = document.getElementById('mynetwork');
    const box = document.getElementById('selectionBox');
    if (!container || !box) return;

    let isSelecting = false;
    let startX = 0;
    let startY = 0;
    let initialSelected = [];

    container.addEventListener('mousedown', (e) => {
        // Only trigger on left-click
        if (e.button !== 0) return;

        // Active in 'select' mode OR in 'move' mode with Shift
        const canBoxSelect = (state.currentMode === 'select') || (state.currentMode === 'move' && e.shiftKey);
        if (!canBoxSelect) return;

        const rect = container.getBoundingClientRect();
        const domX = e.clientX - rect.left;
        const domY = e.clientY - rect.top;

        // In move mode with Shift, let Vis.js handle single-node toggling if clicked directly on node
        if (state.currentMode === 'move' && state.network) {
            const nodeAt = state.network.getNodeAt({ x: domX, y: domY });
            if (nodeAt) return;
        }

        isSelecting = true;
        startX = domX;
        startY = domY;
        initialSelected = (e.shiftKey && state.network) ? state.network.getSelectedNodes() : [];

        box.style.left = startX + 'px';
        box.style.top = startY + 'px';
        box.style.width = '0px';
        box.style.height = '0px';
        box.style.display = 'none';

        if (state.network) {
            state.network.setOptions({ interaction: { dragView: false } });
        }

        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isSelecting || !state.network) return;

        const rect = container.getBoundingClientRect();
        const curX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const curY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

        const dist = Math.hypot(curX - startX, curY - startY);
        if (dist > 3) {
            box.style.display = 'block';
        }

        const minX = Math.min(startX, curX);
        const minY = Math.min(startY, curY);
        const maxX = Math.max(startX, curX);
        const maxY = Math.max(startY, curY);

        box.style.left = minX + 'px';
        box.style.top = minY + 'px';
        box.style.width = (maxX - minX) + 'px';
        box.style.height = (maxY - minY) + 'px';

        if (dist <= 3) return;

        // Real-time selection of all nodes intersecting or inside rectangle
        const allPositions = state.network.getPositions();
        const newlySelected = [];

        const canvasP1 = state.network.DOMtoCanvas({ x: minX, y: minY });
        const canvasP2 = state.network.DOMtoCanvas({ x: maxX, y: maxY });
        const cLeft = Math.min(canvasP1.x, canvasP2.x);
        const cRight = Math.max(canvasP1.x, canvasP2.x);
        const cTop = Math.min(canvasP1.y, canvasP2.y);
        const cBottom = Math.max(canvasP1.y, canvasP2.y);

        for (const nodeId in allPositions) {
            let hit = false;
            try {
                if (typeof state.network.getBoundingBox === 'function') {
                    const b = state.network.getBoundingBox(nodeId);
                    if (!(b.left > cRight || b.right < cLeft || b.top > cBottom || b.bottom < cTop)) {
                        hit = true;
                    }
                }
            } catch (_) {}
            if (!hit) {
                const pos = allPositions[nodeId];
                const domPos = state.network.canvasToDOM(pos);
                if (domPos.x >= minX && domPos.x <= maxX && domPos.y >= minY && domPos.y <= maxY) {
                    hit = true;
                }
            }
            if (hit) {
                newlySelected.push(nodeId);
            }
        }

        const combined = new Set(initialSelected);
        newlySelected.forEach(id => combined.add(id));
        state.network.selectNodes(Array.from(combined));
    });

    window.addEventListener('mouseup', (e) => {
        if (!isSelecting) return;
        const wasDragged = box.style.display === 'block';
        isSelecting = false;
        box.style.display = 'none';

        if (state.network && state.currentMode === 'move') {
            state.network.setOptions({ interaction: { dragView: true } });
        }

        // Handle single-click in select mode without drag
        if (!wasDragged && state.currentMode === 'select' && state.network) {
            const rect = container.getBoundingClientRect();
            const domX = e.clientX - rect.left;
            const domY = e.clientY - rect.top;
            if (domX >= 0 && domX <= rect.width && domY >= 0 && domY <= rect.height) {
                const clickedNode = state.network.getNodeAt({ x: domX, y: domY });
                if (clickedNode) {
                    if (e.shiftKey) {
                        const cur = state.network.getSelectedNodes();
                        if (cur.includes(clickedNode)) {
                            state.network.selectNodes(cur.filter(id => id !== clickedNode));
                        } else {
                            state.network.selectNodes([...cur, clickedNode]);
                        }
                    } else {
                        state.network.selectNodes([clickedNode]);
                    }
                } else if (!e.shiftKey) {
                    state.network.unselectAll();
                }
            }
        }
    });
}
