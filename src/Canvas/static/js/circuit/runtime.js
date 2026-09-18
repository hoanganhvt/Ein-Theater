// Shared across circuit modules; keep this object identity stable.
export const runtime = {
    container: null,
    activeFoldDrag: null, // { edgeId, foldMode } during handle dragging
    wireStartNode: null, // Source node ID for an unfinished connection
    wireWaypoints: [],
    waypointSteps: [], // Points added by each click, for undo
    wirePath: [],
    currentMouseGrid: null,
    hoveredTargetNode: null,
    dragStartPos: null,
    isMouseDown: false,
    waypointAddedOnMouseDown: false,
    previewBendMode: 'horizontal',
    currentDragDir: null,
    isFinishingWire: false, // Prevent duplicate asynchronous edge creation
    listenersBound: false, // DOM listeners survive network replacement
    lastSelectedEdgeId: null,
    currentEditingEdgeId: null,
};
