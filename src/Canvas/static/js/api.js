import { projectsApi } from './api/projects.js';
import { workspaceApi } from './api/workspace.js';
import { nodesApi } from './api/nodes.js';
import { edgesApi } from './api/edges.js';
import { graphApi } from './api/graph.js';
import { attachShapeRefresh } from './api/shapeRefresh.js';
import { runtimeApi } from './api/runtime.js';
export { tensorSummary, integratedShapeLabel } from './api/labels.js';

export const api = { ...projectsApi, ...workspaceApi, ...nodesApi, ...edgesApi, ...graphApi, ...runtimeApi };
attachShapeRefresh(api);
