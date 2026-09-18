// Public interface for the circuit feature. Implementation lives in ./circuit/.
export { runtime } from './circuit/runtime.js';
export { GRID_SIZE, BEND_MODES, BEND_LABELS } from './circuit/constants.js';
export { snapToGrid, computeOrthogonalLines, simplifyLines, updateEdgeEndpoints, computeEdgeLines, getEdgeFoldHandlePos, pointToSegmentDistance, getEdgeMidpoint } from './circuit/geometry.js';
export { cycleEdgeFoldMode, invertEdgeFold, getEdgeAtCanvasPos, getEdgeColors, updateEdgeIndices } from './circuit/edges.js';
export { updateConnectBanner, cancelWireCreation, addWireWaypoint, popWireWaypoint, extendWirePath } from './circuit/wiring.js';
export { updateEdgeUISelection, getActiveEdgeId } from './circuit/selection.js';
export { openEditEdgeModal, closeEditEdgeModal, saveEditEdgeModal, deleteEdgeFromModal, deleteSelectedEdge, deleteSelectedEdgeFromBar, deleteEdgeById } from './circuit/editor.js';
export { setupCircuitCanvas } from './circuit/setup.js';
