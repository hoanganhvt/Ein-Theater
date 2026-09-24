const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('einDesktop', Object.freeze({
  selectDirectory: (initialPath = '') => ipcRenderer.invoke('workspace:select-directory', String(initialPath || '')),
  selectPythonExecutable: () => ipcRenderer.invoke('runtime:select-python'),
  windowControls: Object.freeze({
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChange: callback => {
      const listener = (_event, maximized) => callback(Boolean(maximized));
      ipcRenderer.on('window:maximize-changed', listener);
      return () => ipcRenderer.removeListener('window:maximize-changed', listener);
    }
  })
}));
