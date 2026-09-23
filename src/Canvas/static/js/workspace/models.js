import { state } from '../state.js';
import { api } from '../api.js';
import { loadGraph, fitView } from '../graph.js';
import { loadProjects } from '../projects.js';
import { chooseWorkspace } from './chooser.js';
import { loadWorkspaceFiles } from './sidebar.js';
import { showToast } from './notifications.js';
let savingModel = false;

export async function saveActiveModel() {
    if (savingModel) return;
    if (!state.workingDir) {
        alert('Please select a working directory first to save your model.');
        await chooseWorkspace();
        if (!state.workingDir) return;
        return;
    }

    const btn = document.getElementById('btnSaveModel');
    const status = document.getElementById('saveModelStatus');
    const label = btn?.firstChild;
    const origText = label?.textContent;
    savingModel = true;
    if (btn) {
        if (label) label.textContent = 'Saving… ';
        btn.disabled = true;
    }
    if (status) status.hidden = false;

    try {
        const res = await api.saveModel(state.currentProjectId || '', state.workingDir);

        await loadWorkspaceFiles(state.workingDir);

        const modelName = res.modelName || 'Model';
        const folderName = res.folderName || modelName;
        await Promise.all([loadProjects(), loadGraph()]);

        const title = document.getElementById('modelTitle');
        if (title && modelName) {
            title.textContent = modelName;
            document.title = modelName + ' – Neural Network Builder';
        }

        const msg = `Saved '${modelName}' into '${folderName}/' (${folderName}.json, ${folderName}.py)`;
        showToast(msg);
    } catch (err) {
        console.error('Save model error:', err);
        alert('Failed to save model: ' + err.message);
    } finally {
        if (btn) {
            if (label) label.textContent = origText;
            btn.disabled = false;
        }
        if (status) status.hidden = true;
        savingModel = false;
    }
}

export async function loadModelFromFolder(folderPath) {
    try {
        const res = await api.loadModel(folderPath);
        await Promise.all([loadProjects(), loadGraph({ projectId: res.projectId })]);
        fitView();
        showToast(`Model "${res.modelName || 'Model'}" loaded onto canvas (${res.nodeCount || 0} blocks)`);
    } catch (err) {
        console.error('Failed to load model from folder:', err);
        showToast('Failed to load model: ' + err.message);
        alert('Failed to load model: ' + err.message);
    }
}
