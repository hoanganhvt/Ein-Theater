import { state } from '../state.js';
import { getNodeDisplayName } from '../schemas.js';
import { integratedShapeLabel, tensorSummary } from './labels.js';

// Shape inference must not hold up displaying a saved mutation. The Python
// worker is serial, so debounce bursts and send only one analysis at a time.
export function attachShapeRefresh(api) {
    let version = 0;
    let pendingMutations = 0;
    let requested = null;
    let timer = null;
    let running = false;
    let waiters = [];

    function settle() {
        if (timer !== null || running || requested || pendingMutations) return;
        const ready = waiters;
        waiters = [];
        ready.forEach(resolve => resolve());
    }

    function queue() {
        if (!requested || running || pendingMutations || timer !== null) return;
        timer = setTimeout(run, 80);
    }

    async function run() {
        timer = null;
        if (pendingMutations) return; // The final mutation schedules the batch.
        const request = requested;
        requested = null;
        if (!request || request.dataSet !== state.nodesDataSet || request.projectId !== state.currentProjectId) {
            settle();
            return;
        }
        running = true;
        const startedVersion = version;
        try {
            const graph = await api.fetchGraphData({ projectId: request.projectId });
            if (startedVersion !== version || request.dataSet !== state.nodesDataSet ||
                request.projectId !== state.currentProjectId ||
                (request.projectId && graph.projectId !== request.projectId)) return;
            const updates = graph.nodes.filter(node => request.dataSet.get(String(node.id))).map(node => ({
                id: String(node.id), params: node.params, tensorInfo: node.tensorInfo,
                adaptedModel: node.adaptedModel || null,
                ...(node.layerType === 'IntegratedModel' ? { label: integratedShapeLabel(node) } : {}),
                title: `${getNodeDisplayName(node)}\n${tensorSummary(node)}`
            }));
            if (updates.length) request.dataSet.update(updates);
        } catch (error) {
            // The edit is already persisted; a modal alert would freeze input.
            console.error('Unable to refresh automatic dimensions:', error);
        } finally {
            running = false;
            queue();
            settle();
        }
    }

    // Callers may explicitly await metadata synchronization. Normal canvas
    // actions do not. The timer lets newly created nodes enter the dataset first.
    api.refreshShapes = function () {
        if (state.nodesDataSet) {
            requested = { dataSet: state.nodesDataSet, projectId: state.currentProjectId };
            queue();
        }
        return new Promise(resolve => {
            waiters.push(resolve);
            settle();
        });
    };

    for (const method of ['addNode', 'updateNode', 'deleteNode', 'deleteNodes', 'addEdge', 'deleteEdge', 'pasteGraph', 'clearGraph', 'saveModel']) {
        const mutate = api[method];
        api[method] = async function (...args) {
            const dataSet = state.nodesDataSet;
            const projectId = state.currentProjectId;
            ++version; // Reject stale analysis as soon as a new edit starts.
            ++pendingMutations;
            try {
                const result = await mutate.apply(this, args);
                if (dataSet === state.nodesDataSet && projectId === state.currentProjectId) {
                    void api.refreshShapes();
                }
                return result;
            } finally {
                --pendingMutations;
                queue();
                settle();
            }
        };
    }
}
