import { state } from '../state.js';
import { api } from '../api.js';
import { esc } from '../utils.js';
import { openSelectFolderModal } from './browser.js';
import { closeFileMenu } from './menu.js';
import { loadModelFromFolder } from './models.js';
export async function initWorkspace() {
    try {
        await loadWorkspace();
        if (state.workingDir) {
            await loadWorkspaceFiles(state.workingDir);
        } else {
            const container = document.getElementById('workspaceFileList');
            if (container) {
                container.innerHTML = '<div class="workspace-empty-hint">No folder selected. Click to select a folder.</div>';
            }
        }
    } catch (e) {
        console.error('Failed to initialize workspace:', e);
    }

    // Close File menu when clicking outside
    document.addEventListener('click', (e) => {
        const fileMenu = document.getElementById('fileMenuDropdown');
        const fileBtn = document.getElementById('fileMenuBtn');
        if (fileMenu && fileMenu.classList.contains('open')) {
            if (!fileMenu.contains(e.target) && e.target !== fileBtn) {
                closeFileMenu();
            }
        }
    });
}

export async function loadWorkspace() {
    try {
        const data = await api.fetchWorkspace();
        state.workingDir = data.workingDir || '';
        state.workingDirName = data.name || 'None';
        updateWorkspaceUI(state.workingDir, state.workingDirName);
    } catch (e) {
        console.error('Failed to load workspace info:', e);
    }
}

export function updateWorkspaceUI(workingDir, name) {
    const menuDir = document.getElementById('menuWorkingDir');
    const sidebarName = document.getElementById('sidebarWorkingDirName');
    const sidebarPath = document.getElementById('sidebarWorkingDirPath');

    const isNone = !workingDir || workingDir === '' || name === 'None';
    const displayName = isNone ? 'None' : (name || workingDir.split(/[\\/]/).filter(Boolean).pop());

    if (menuDir) {
        menuDir.textContent = isNone ? 'None' : workingDir;
        menuDir.title = isNone ? '' : workingDir;
    }
    if (sidebarName) sidebarName.textContent = displayName;
    if (sidebarPath) {
        sidebarPath.textContent = isNone ? 'No folder selected' : workingDir;
        sidebarPath.title = isNone ? '' : workingDir;
    }
}

export async function loadWorkspaceFiles(dirPath) {
    const container = document.getElementById('workspaceFileList');
    if (!container) return;

    if (!dirPath) {
        container.innerHTML = '<div class="workspace-empty-hint">No folder selected. Click to select a folder.</div>';
        return;
    }

    try {
        const data = await api.browseDirectory(dirPath);
        container.innerHTML = '';

        const folders = data.folders || [];
        const files = data.files || [];

        if (folders.length === 0 && files.length === 0) {
            container.innerHTML = '<div class="workspace-empty-hint">Folder is empty</div>';
            return;
        }

        // Render subfolders
        folders.forEach(f => {
            const item = document.createElement('div');
            item.className = 'workspace-file-item is-folder' + (f.isModel ? ' is-model-folder' : '');
            item.title = f.isModel 
                ? `Model: "${f.name}" – Click to load onto canvas` 
                : f.path;
            
            const icon = f.isModel ? '&#9671;' : '&#9649;';
            const badgeHtml = f.isModel ? `<span class="model-badge" title="Verified PyTorch Model Folder">Model</span>` : '';
            
            item.innerHTML = `
                <span class="file-icon">${icon}</span>
                <span class="file-name">${esc(f.name)}</span>
                ${badgeHtml}
            `;
            if (f.isModel) {
                item.setAttribute('draggable', 'true');
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                        type: 'model_folder',
                        path: f.path,
                        name: f.name
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                    item.classList.add('dragging');
                });
                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                });
            }
            item.addEventListener('click', async () => {
                if (f.isModel) {
                    await loadModelFromFolder(f.path);
                } else {
                    openSelectFolderModal(f.path);
                }
            });
            container.appendChild(item);
        });

        // Render files
        files.forEach(f => {
            const item = document.createElement('div');
            item.className = 'workspace-file-item is-file';
            item.title = f.path;
            const ext = f.name.split('.').pop().toLowerCase();
            let icon = '&#183;';
            if (ext === 'py') icon = 'py';
            else if (ext === 'json') icon = '{}';
            else if (ext === 'md') icon = 'md';
            else if (['jpg', 'png', 'svg', 'gif'].includes(ext)) icon = 'img';

            item.innerHTML = `
                <span class="file-icon">${icon}</span>
                <span class="file-name">${esc(f.name)}</span>
            `;
            container.appendChild(item);
        });
    } catch (e) {
        console.warn('Could not list workspace files:', e);
        container.innerHTML = '<div class="workspace-empty-hint">Could not list contents</div>';
    }
}

export async function promptCreateFolderSidebar() {
    if (!state.workingDir) {
        alert('Please select a working directory first.');
        openSelectFolderModal();
        return;
    }
    const folderName = prompt(`Create new folder inside "${state.workingDirName}":`);
    if (!folderName || !folderName.trim()) return;

    try {
        await api.createFolder(state.workingDir, folderName.trim());
        await loadWorkspaceFiles(state.workingDir);
    } catch (err) {
        alert('Failed to create folder: ' + err.message);
    }
}
