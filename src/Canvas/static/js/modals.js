// Public interface for the modals feature. Implementation lives in ./modals/.
export { CATEGORY_DEFINITIONS, populateCategoryDropdown, populateNodeTypeDropdown, updateNodePreview } from './modals/categories.js';
export { setupAddNodeModalListeners, openAddNodeModal, toggleCustom, saveNode, cancelNode, closeModal, openAddNodeAtContext } from './modals/add.js';
export { openEditNodeModal, closeEditModal, openEditNodeFromContext } from './modals/edit.js';
export { closeAllModals } from './modals/lifecycle.js';
export { saveEditNode } from './modals/parameters.js';
