import './js/application/handlers.js';
import { initApp } from './js/application/bootstrap.js';
export { initApp } from './js/application/bootstrap.js';
export { invertSelectedEdgeFold, cycleSelectedEdgeFold } from './js/application/handlers.js';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
