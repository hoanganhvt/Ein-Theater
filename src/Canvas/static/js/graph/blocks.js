import { state } from '../state.js';
import { api } from '../api.js';
import { LAYER_SCHEMAS, getDefaultParams, getNodeDisplayName } from '../schemas.js';
import { snapToGrid } from '../circuit.js';
export async function createBlock(label, posX, posY) {
    try {
        const baseType = label;
        const defaultParams = LAYER_SCHEMAS[baseType] ? getDefaultParams(baseType) : {};

        // Snap placement position to nearest grid point
        const { x: snappedX, y: snappedY } = snapToGrid(posX, posY);

        const newNode = await api.addNode(baseType, baseType, snappedX, snappedY, defaultParams);
        const displayName = getNodeDisplayName(newNode);

        const nodeObj = {
            tensorInfo: newNode.tensorInfo,
            id: String(newNode.id),
            label: displayName,
            title: displayName,
            layerType: baseType,
            params: defaultParams,
            shape: 'box',
            x: (typeof newNode.x === 'number' && !isNaN(newNode.x)) ? newNode.x : snappedX,
            y: (typeof newNode.y === 'number' && !isNaN(newNode.y)) ? newNode.y : snappedY
        };

        if (state.nodesDataSet) {
            state.nodesDataSet.update(nodeObj);
        }
        return nodeObj;
    } catch (err) {
        console.error('Error adding block:', err);
        alert('Error adding block: ' + err.message);
    }
}
