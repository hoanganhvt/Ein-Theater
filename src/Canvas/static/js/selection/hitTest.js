import { state } from '../state.js';

// Bounds are DOM pixels; Vis bounding boxes are network coordinates.
export function nodesInRectangle(minX, minY, maxX, maxY) {
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

    return newlySelected;
}
