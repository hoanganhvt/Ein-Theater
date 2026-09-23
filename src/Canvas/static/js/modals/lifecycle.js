import { closeEditEdgeModal } from '../circuit.js';
import { cancelNode } from './add.js';
import { closeEditModal } from './edit.js';
export function closeAllModals() {
    cancelNode();
    closeEditModal();
    closeEditEdgeModal();
}
