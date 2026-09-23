const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('einDesktop', Object.freeze({
  selectDirectory: (initialPath = '') => ipcRenderer.invoke('workspace:select-directory', String(initialPath || '')),
  selectPythonExecutable: () => ipcRenderer.invoke('runtime:select-python')
}));
