import { state } from '../state.js';
import { api } from '../api.js';
import { esc } from '../utils.js';
import { updateWorkspaceUI, loadWorkspaceFiles } from './sidebar.js';
import { closeFileMenu } from './menu.js';
import { loadModelFromFolder } from './models.js';
let parentBrowsingDir = '';

let selectedFolderRowPath = null;

// ── Folder Selection Modal ────────────────────────────────────────

export function openSelectFolderModal(targetDir = null) {
    closeFileMenu();
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('selectFolderModal');

    if (overlay) overlay.style.display = 'block';
    if (modal) modal.style.display = 'block';

    selectedFolderRowPath = null;
    const initialDir = targetDir || state.workingDir || '';
    browseTo(initialDir);
}

export function closeSelectFolderModal() {
    const modal = document.getElementById('selectFolderModal');
    if (modal) modal.style.display = 'none';

    selectedFolderRowPath = null;
    const overlay = document.getElementById('modalOverlay');
    const nodeModal = document.getElementById('nodeModal');
    const editModal = document.getElementById('editLayerModal');
    if (overlay && (!nodeModal || nodeModal.style.display !== 'block') && (!editModal || editModal.style.display !== 'block')) {
        overlay.style.display = 'none';
    }
}

export async function browseTo(dirPath) {
    const pathInput = document.getElementById('folderPathInput');
    const listContainer = document.getElementById('folderBrowserList');
    const drivesContainer = document.getElementById('folderDrivesBar');
    const confirmBtn = document.getElementById('confirmFolderBtn');

    selectedFolderRowPath = null;

    if (listContainer) {
        listContainer.innerHTML = '<div class="folder-browser-loading">Loading...</div>';
    }

    try {
        const data = await api.browseDirectory(dirPath);
        state.browsingDir = data.current;
        parentBrowsingDir = data.parent || '';

        if (pathInput) {
            pathInput.value = data.current;
        }

        // Update "Select This Folder" button
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Select This Folder';
            const dirName = data.current.split(/[\\/]/).filter(Boolean).pop() || data.current;
            confirmBtn.title = `Set "${dirName}" as working directory`;
        }

        // Render drive shortcuts
        if (drivesContainer && Array.isArray(data.drives)) {
            drivesContainer.innerHTML = '';
            data.drives.forEach(drive => {
                const btn = document.createElement('button');
                btn.className = 'drive-chip' + (data.current.toUpperCase().startsWith(drive.toUpperCase()) ? ' active' : '');
                btn.textContent = drive;
                btn.title = `Switch to ${drive}`;
                btn.onclick = () => {
                    selectedFolderRowPath = null;
                    browseTo(drive);
                };
                drivesContainer.appendChild(btn);
            });
        }

        // Render directory entries
        if (listContainer) {
            listContainer.innerHTML = '';

            // Parent directory item (if available)
            if (parentBrowsingDir) {
                const parentRow = document.createElement('div');
                parentRow.className = 'folder-browser-row parent-row';
                parentRow.title = 'Navigate up to parent directory';
                parentRow.innerHTML = `
                    <span class="fb-icon" aria-hidden="true">&#183;</span>
                    <span class="fb-name">.. (Go Up)</span>
                `;
                parentRow.onclick = () => {
                    selectedFolderRowPath = null;
                    browseTo(parentBrowsingDir);
                };
                listContainer.appendChild(parentRow);
            }

            const folders = data.folders || [];
            if (folders.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.className = 'folder-browser-empty';
                emptyMsg.textContent = 'No subdirectories in this folder.';
                listContainer.appendChild(emptyMsg);
            } else {
                folders.forEach(f => {
                    const row = document.createElement('div');
                    row.className = 'folder-browser-row is-folder' + (f.isModel ? ' is-model-folder' : '');
                    row.title = `Click to select "${f.name}", or double-click to open`;


                    const tagHtml = f.isModel ? `<span class="model-tag">Model</span>` : '';
                    const loadBtnHtml = f.isModel
                        ? `<button class="fb-load-btn" title="Load this model directly onto canvas">Load model</button>`
                        : '';

                    row.innerHTML = `
                        <span class="fb-icon" aria-hidden="true">&#183;</span>
                        <span class="fb-name">${esc(f.name)} ${tagHtml}</span>
                        <div class="fb-actions">
                            ${loadBtnHtml}
                            <button class="fb-select-btn" title="Set this folder as working directory">✓ Select</button>
                            <button class="fb-open-btn" title="Browse into this folder">Open →</button>
                        </div>
                    `;

                    // A single click selects a folder, including model folders.
                    row.onclick = () => {
                        listContainer.querySelectorAll('.folder-browser-row').forEach(r => r.classList.remove('selected'));
                        row.classList.add('selected');
                        selectedFolderRowPath = f.path;
                        if (pathInput) pathInput.value = f.path;
                        if (confirmBtn) {
                            confirmBtn.textContent = `Select "${f.name}"`;
                            confirmBtn.title = `Set "${f.name}" as working directory`;
                        }
                    };

                    // Double-click navigates inside
                    row.ondblclick = () => {
                        selectedFolderRowPath = null;
                        browseTo(f.path);
                    };

                    // " Load Model" button: loads model directly
                    const loadBtn = row.querySelector('.fb-load-btn');
                    if (loadBtn) {
                        loadBtn.onclick = async (e) => {
                            e.stopPropagation();
                            await loadModelFromFolder(f.path);
                        };
                    }

                    // "✓ Select" button confirms immediately
                    const selectBtn = row.querySelector('.fb-select-btn');
                    if (selectBtn) {
                        selectBtn.onclick = async (e) => {
                            e.stopPropagation();
                            await applyDirectorySelection(f.path);
                        };
                    }

                    // "Open →" button navigates inside
                    const openBtn = row.querySelector('.fb-open-btn');
                    if (openBtn) {
                        openBtn.onclick = (e) => {
                            e.stopPropagation();
                            selectedFolderRowPath = null;
                            browseTo(f.path);
                        };
                    }

                    listContainer.appendChild(row);
                });
            }

            // Show files (non-navigable, for context only)
            const files = data.files || [];
            if (files.length > 0) {
                const filesDivider = document.createElement('div');
                filesDivider.className = 'folder-browser-files-header';
                filesDivider.textContent = `Files in this folder (${files.length})`;
                listContainer.appendChild(filesDivider);

                files.forEach(f => {
                    const row = document.createElement('div');
                    row.className = 'folder-browser-row is-file';
                    row.innerHTML = `
                        <span class="fb-icon" aria-hidden="true">&#183;</span>
                        <span class="fb-name">${esc(f.name)}</span>
                    `;
                    listContainer.appendChild(row);
                });
            }
        }
    } catch (err) {
        console.error('Failed to browse directory:', err);
        if (confirmBtn) confirmBtn.disabled = true;
        if (listContainer) {
            listContainer.innerHTML = `<div class="folder-browser-error">Error: ${esc(err.message)}</div>`;
        }
    }
}

export function browseParentFolder() {
    if (parentBrowsingDir) {
        selectedFolderRowPath = null;
        browseTo(parentBrowsingDir);
    }
}

export function applyTypedPath() {
    const input = document.getElementById('folderPathInput');
    if (!input) return;
    const val = input.value.trim();
    if (val) {
        selectedFolderRowPath = null;
        browseTo(val);
    }
}

async function applyDirectorySelection(dirPath) {
    if (!dirPath) return;
    try {
        const data = await api.setWorkspace(dirPath);
        state.workingDir = data.workingDir;
        state.workingDirName = data.name;
        updateWorkspaceUI(data.workingDir, data.name);
        await loadWorkspaceFiles(data.workingDir);
        closeSelectFolderModal();
    } catch (e) {
        console.error('Failed to set working directory:', e);
        alert('Failed to set working directory: ' + e.message);
    }
}

export async function confirmSelectFolder() {
    const target = selectedFolderRowPath || state.browsingDir;
    if (!target) return;
    await applyDirectorySelection(target);
}

export async function browseSystemFolder() {
    try {
        const data = await api.selectNativeFolder();
        if (data.cancelled) return;
        if (data.workingDir) {
            await applyDirectorySelection(data.workingDir);
        }
    } catch (e) {
        console.warn('Native picker error:', e);
        alert('Could not open system dialog: ' + e.message);
    }
}

export async function promptCreateFolderModal() {
    const parentDir = state.browsingDir || state.workingDir;
    if (!parentDir) {
        alert('Please browse to or select a directory first.');
        return;
    }
    const folderName = prompt('Enter new folder name:');
    if (!folderName || !folderName.trim()) return;

    try {
        await api.createFolder(parentDir, folderName.trim());
        await browseTo(parentDir);
        if (state.workingDir && parentDir.startsWith(state.workingDir)) {
            await loadWorkspaceFiles(state.workingDir);
        }
    } catch (err) {
        alert('Failed to create folder: ' + err.message);
    }
}
