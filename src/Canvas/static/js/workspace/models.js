import { state } from '../state.js';
import { api } from '../api.js';
import { loadGraph, fitView } from '../graph.js';
import { loadProjects } from '../projects.js';
import { openSelectFolderModal, closeSelectFolderModal } from './browser.js';
import { loadWorkspaceFiles } from './sidebar.js';
import { showToast } from './notifications.js';
export async function saveActiveModel() {
    if (!state.workingDir) {
        alert('Please select a working directory first to save your model.');
        openSelectFolderModal();
        return;
    }

    const btn = document.getElementById('btnSaveModel');
    const origText = btn ? btn.textContent : '💾 Save';
    if (btn) {
        btn.textContent = '💾 Saving...';
        btn.disabled = true;
    }

    try {
        const res = await api.saveModel(state.currentProjectId || '', state.workingDir);

        await loadWorkspaceFiles(state.workingDir);

        const modelName = res.modelName || 'Model';
        const folderName = res.folderName || modelName;
        await loadProjects();
        await loadGraph();

        const title = document.getElementById('modelTitle');
        if (title && modelName) {
            title.textContent = modelName;
            document.title = modelName + ' – Neural Network Builder';
        }

        const msg = `✅ Saved '${modelName}' into '${folderName}/' (${folderName}.json, ${folderName}.py)`;
        showToast(msg);
    } catch (err) {
        console.error('Save model error:', err);
        alert('Failed to save model: ' + err.message);
    } finally {
        if (btn) {
            btn.textContent = origText;
            btn.disabled = false;
        }
    }
}

export async function loadModelFromFolder(folderPath) {
    try {
        const res = await api.loadModel(folderPath);
        await loadProjects();
        await loadGraph();
        fitView();
        closeSelectFolderModal();
        showToast(`⚡ Model "${res.modelName || 'Model'}" loaded onto canvas (${res.nodeCount || 0} blocks)`);
    } catch (err) {
        console.error('Failed to load model from folder:', err);
        showToast('Failed to load model: ' + err.message);
        alert('Failed to load model: ' + err.message);
    }
}
