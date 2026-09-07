// ── Workspace & Working Directory Management ───────────────────────
import { state } from './state.js';
import { api } from './api.js';
import { esc } from './utils.js';

let parentBrowsingDir = '';
let selectedFolderRowPath = null;

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
    const headerName = document.getElementById('headerWorkingDirName');
    const headerPill = document.getElementById('headerWorkingDirPill');
    const menuDir = document.getElementById('menuWorkingDir');
    const sidebarName = document.getElementById('sidebarWorkingDirName');
    const sidebarPath = document.getElementById('sidebarWorkingDirPath');

    const isNone = !workingDir || workingDir === '' || name === 'None';
    const displayName = isNone ? 'None' : (name || workingDir.split(/[\\/]/).filter(Boolean).pop());

    if (headerName) headerName.textContent = displayName;
    if (headerPill) headerPill.title = isNone ? 'No working directory selected. Click to select a folder.' : `Current Working Directory: ${workingDir}`;
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
            item.className = 'workspace-file-item is-folder';
            item.title = f.path;
            item.innerHTML = `
                <span class="file-icon">📁</span>
                <span class="file-name">${esc(f.name)}</span>
            `;
            item.addEventListener('click', () => {
                openSelectFolderModal(f.path);
            });
            container.appendChild(item);
        });

        // Render files
        files.forEach(f => {
            const item = document.createElement('div');
            item.className = 'workspace-file-item is-file';
            item.title = f.path;
            const ext = f.name.split('.').pop().toLowerCase();
            let icon = '📄';
            if (ext === 'py') icon = '🐍';
            else if (ext === 'json') icon = '📦';
            else if (ext === 'md') icon = '📝';
            else if (['jpg', 'png', 'svg', 'gif'].includes(ext)) icon = '🖼️';

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

// ── File Menu ─────────────────────────────────────────────────────

export function toggleFileMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('fileMenuDropdown');
    const btn = document.getElementById('fileMenuBtn');
    if (!menu) return;

    const isOpen = menu.classList.contains('open');
    if (isOpen) {
        closeFileMenu();
    } else {
        menu.classList.add('open');
        if (btn) btn.classList.add('active');
    }
}

export function closeFileMenu() {
    const menu = document.getElementById('fileMenuDropdown');
    const btn = document.getElementById('fileMenuBtn');
    if (menu) menu.classList.remove('open');
    if (btn) btn.classList.remove('active');
}

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
                    <span class="fb-icon">⬆️</span>
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
                    row.className = 'folder-browser-row is-folder';
                    row.title = `Click to select "${f.name}", or double-click to open`;
                    row.innerHTML = `
                        <span class="fb-icon">📁</span>
                        <span class="fb-name">${esc(f.name)}</span>
                        <div class="fb-actions">
                            <button class="fb-select-btn" title="Set this folder as working directory">✓ Select</button>
                            <button class="fb-open-btn" title="Browse into this folder">Open →</button>
                        </div>
                    `;

                    // Single-click selects and highlights this folder
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
                        <span class="fb-icon">📄</span>
                        <span class="fb-name">${esc(f.name)}</span>
                    `;
                    listContainer.appendChild(row);
                });
            }
        }
    } catch (err) {
        console.error('Failed to browse directory:', err);
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
