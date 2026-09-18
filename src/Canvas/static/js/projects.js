// Public interface for the projects feature. Implementation lives in ./projects/.
export { loadProjects, renderProjectList, createProject, switchProject, deleteProject } from './projects/list.js';
export { startRename, commitRename, cancelRename } from './projects/rename.js';
