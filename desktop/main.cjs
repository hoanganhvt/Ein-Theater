const { app, BrowserWindow, dialog, ipcMain, Menu, session } = require('electron');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

let mainWindow = null;
let serverProcess = null;
let serverUrl = '';
let allowQuit = false;
const smokeResultPath = process.env.EIN_THEATER_SMOKE_RESULT || '';
if (process.env.EIN_THEATER_SMOKE_USER_DATA) {
  app.setPath('userData', process.env.EIN_THEATER_SMOKE_USER_DATA);
}

function reportSmoke(payload) {
  if (!smokeResultPath) return;
  fs.mkdirSync(path.dirname(smokeResultPath), { recursive: true });
  fs.writeFileSync(smokeResultPath, JSON.stringify(payload));
}

function locations() {
  if (app.isPackaged) {
    return {
      server: path.join(process.resourcesPath, 'server', 'ein-theater-server.exe'),
      resources: path.join(process.resourcesPath, 'app-src'),
      staticOverlay: ''
    };
  }
  const root = path.resolve(__dirname, '..');
  return {
    server: path.join(__dirname, 'build', 'ein-theater-server.exe'),
    resources: path.join(root, 'src'),
    staticOverlay: path.join(__dirname, 'runtime-static')
  };
}

function readWindowState() {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf8'));
    if (value.width >= 800 && value.height >= 600) return value;
  } catch (_) {}
  return { width: 1440, height: 900 };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.getBounds();
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify(bounds));
  } catch (error) {
    console.error('Could not save window state:', error);
  }
}

function logShutdown(stage) {
  console.info('Shutdown:', stage);
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'shutdown.log'), `${new Date().toISOString()} ${stage}\n`);
  } catch (error) {
    console.error('Could not write shutdown log:', error);
  }
}

function startServer(token) {
  return new Promise((resolve, reject) => {
    const dirs = locations();
    const child = spawn(dirs.server, [], {
      cwd: path.dirname(dirs.server),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        EIN_THEATER_DESKTOP: '1',
        EIN_THEATER_DATA_DIR: app.getPath('userData'),
        EIN_THEATER_RESOURCE_DIR: dirs.resources,
        EIN_THEATER_STATIC_OVERLAY_DIR: dirs.staticOverlay,
        EIN_THEATER_AUTH_TOKEN: token
      }
    });
    serverProcess = child;
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    const timeout = setTimeout(() => reject(new Error('Ein Theater server did not become ready in time.\n' + stderr)), 20000);
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      try {
        const event = JSON.parse(line);
        if (event.event === 'ready' && event.url) {
          clearTimeout(timeout);
          lines.close();
          resolve(event.url);
        }
      } catch (_) {}
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      serverProcess = null;
      if (!allowQuit) {
        dialog.showErrorBox('Ein Theater stopped', `The local server exited unexpectedly (${code}).\n${stderr}`);
        app.quit();
      }
    });
  });
}

function installSecurity(token) {
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${serverUrl}/*`] }, (details, callback) => {
    details.requestHeaders['X-Ein-Theater-Token'] = token;
    callback({ requestHeaders: details.requestHeaders });
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}

function createWindow() {
  const smoke = process.env.EIN_THEATER_SMOKE === '1';
  if (smoke) reportSmoke({ event: 'smoke-progress', stage: 'window-start' });
  if (smoke && process.env.EIN_THEATER_SMOKE_FOLDER) {
    dialog.showOpenDialog = async (_parent, options) => {
      if (!options.properties?.includes('openDirectory')) throw new Error('native directory picker was not requested');
      return { canceled: false, filePaths: [process.env.EIN_THEATER_SMOKE_FOLDER] };
    };
  }
  const state = readWindowState();
  mainWindow = new BrowserWindow({
    ...state,
    minWidth: 900,
    minHeight: 650,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#11151c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (smoke) reportSmoke({ event: 'smoke-progress', stage: 'window-created' });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(serverUrl + '/')) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => { if (!smoke) mainWindow.show(); });
  const publishMaximizeState = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximize-changed', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', publishMaximizeState);
  mainWindow.on('unmaximize', publishMaximizeState);
  mainWindow.on('close', () => { logShutdown('window-close'); saveWindowState(); });
  mainWindow.on('closed', () => { logShutdown('window-closed'); mainWindow = null; });
  mainWindow.webContents.on('will-prevent-unload', event => {
    logShutdown('beforeunload-blocked');
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Discard and close'], defaultId: 0, cancelId: 0,
      title: 'Unsaved Code changes', message: 'Discard unsaved Code changes and close?'
    });
    if (choice === 1) event.preventDefault();
  });
  if (smoke) {
    mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
      if (code === -3) return; // ERR_ABORTED: the Canvas load was replaced by Code navigation.
      reportSmoke({ event: 'smoke-error', stage: 'load', code, description, serverUrl });
      app.quit();
    });
    mainWindow.webContents.once('did-finish-load', async () => {
      reportSmoke({ event: 'smoke-progress', stage: 'canvas-loaded' });
      try {
        const result = await mainWindow.webContents.executeJavaScript(`(async () => {
          for (let i = 0; i < 50 && !window.chooseWorkspace; i++) await new Promise(resolve => setTimeout(resolve, 100));
          const selection = await window.chooseWorkspace?.();
          const beforeMaximize = await window.einDesktop.windowControls.isMaximized();
          const afterMaximize = await window.einDesktop.windowControls.toggleMaximize();
          const afterRestore = await window.einDesktop.windowControls.toggleMaximize();
          for (let i = 0; i < 50 && !window.state?.network; i++) await new Promise(resolve => setTimeout(resolve, 100));
          return {
            title: document.title,
            hasDesktopBridge: !!window.einDesktop?.selectDirectory,
            hasLegacyFolderModal: !!document.querySelector('#folderBrowserModal, #shellFolderDialog'),
            hasVisNetwork: !!window.vis?.Network,
            hasCanvasNetwork: !!window.state?.network,
            hasCustomWindowControls: !!document.querySelector('.window-controls [data-window-action="close"]'),
            windowStateCycle: [beforeMaximize, afterMaximize, afterRestore],
            selectedWorkspace: selection?.workingDir || '',
            health: await fetch('/api/health').then(response => response.json())
          };
        })()`);
        result.hasNativeMenu = Menu.getApplicationMenu() !== null;
        result.hasCodeConverter = fs.existsSync(path.join(locations().resources, 'Code', 'utils', 'compile.py'));
        reportSmoke({ event: 'smoke-progress', stage: 'canvas-checked' });
        if (process.env.EIN_THEATER_SMOKE_CANVAS === '1') {
          if (process.env.EIN_THEATER_SMOKE_SCREENSHOT) {
            const screenshot = await mainWindow.webContents.capturePage();
            fs.writeFileSync(process.env.EIN_THEATER_SMOKE_SCREENSHOT, screenshot.toPNG());
          }
          const serverPid = serverProcess?.pid;
          mainWindow.once('closed', () => reportSmoke({ event: 'smoke', ...result, closeVerified: true, serverPid }));
          reportSmoke({ event: 'smoke-progress', stage: 'canvas-close-requested' });
          mainWindow.close(); // Same native window-close path as Alt+F4.
          return;
        }
        await mainWindow.loadURL(serverUrl + '/code');
        reportSmoke({ event: 'smoke-progress', stage: 'code-loaded' });
        result.codeMode = await mainWindow.webContents.executeJavaScript(`(async () => {
          for (let i = 0; i < 50 && !document.querySelector('.window-controls'); i++) await new Promise(resolve => setTimeout(resolve, 100));
          const created = await fetch('/api/code/file', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'desktop-smoke.py', source: 'class Model: pass' }) });
          const saved = await created.json();
          const opened = await fetch('/api/code/file?path=desktop-smoke.py').then(response => response.json());
          const removed = await fetch('/api/code/file', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'desktop-smoke.py', expectedHash: saved.hash }) });
          return {
            page: document.body.dataset.studioMode,
            hasEditor: !!document.querySelector('#codeSource'),
            hasCompile: !!document.querySelector('#compileCode'),
            hasPythonConfig: !!document.querySelector('#configurePython'),
            hasWindowControls: !!document.querySelector('.window-controls [data-window-action="close"]'),
            fileRoundTrip: created.ok && opened.source === 'class Model: pass' && removed.ok
          };
        })()`);
        reportSmoke({ event: 'smoke-progress', stage: 'code-checked' });
        if (process.env.EIN_THEATER_SMOKE_DIRTY === '1') {
          await mainWindow.webContents.executeJavaScript(`document.querySelector('#codeSource').value += '\\n# unsaved'`);
          let confirmSeen;
          const prompted = new Promise(resolve => { confirmSeen = resolve; });
          dialog.showMessageBoxSync = () => { confirmSeen(); return 0; };
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-window-action="close"]').click()`);
          await prompted;
          result.cancelKeptWindow = !mainWindow.isDestroyed();
          result.cancelKeptServer = await mainWindow.webContents.executeJavaScript(`fetch('/api/health').then(response => response.ok)`);
          dialog.showMessageBoxSync = () => { result.confirmedDiscard = true; return 1; };
        }
        if (process.env.EIN_THEATER_SMOKE_SCREENSHOT) {
          const screenshot = await mainWindow.webContents.capturePage();
          fs.writeFileSync(process.env.EIN_THEATER_SMOKE_SCREENSHOT, screenshot.toPNG());
        }
        const serverPid = serverProcess?.pid;
        mainWindow.once('closed', () => reportSmoke({ event: 'smoke', ...result, closeVerified: true, serverPid }));
        reportSmoke({ event: 'smoke-progress', stage: 'close-requested' });
        await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-window-action="close"]').click()`);
      } catch (error) {
        reportSmoke({ event: 'smoke-error', stage: 'renderer', error: error.stack || error.message });
        process.stderr.write(error.stack + '\n');
        process.exitCode = 1;
      }
      if (process.exitCode) app.quit();
    });
  }
  if (smoke) reportSmoke({ event: 'smoke-progress', stage: 'canvas-requested' });
  mainWindow.loadURL(serverUrl + '/');
}

ipcMain.handle('workspace:select-directory', async (_event, initialPath) => {
  const options = { title: 'Select Workspace Folder', properties: ['openDirectory', 'createDirectory'] };
  if (initialPath && fs.existsSync(initialPath)) options.defaultPath = initialPath;
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle('runtime:select-python', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Python Executable',
    properties: ['openFile'],
    filters: [{ name: 'Python executable', extensions: ['exe'] }]
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

function trustedWindow(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      !event.senderFrame.url.startsWith(serverUrl + '/')) {
    throw new Error('untrusted window control request');
  }
  return mainWindow;
}

ipcMain.handle('window:minimize', event => trustedWindow(event).minimize());
ipcMain.handle('window:toggle-maximize', event => {
  const window = trustedWindow(event);
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
  return window.isMaximized();
});
ipcMain.handle('window:close', event => { logShutdown('close-ipc'); trustedWindow(event).close(); });
ipcMain.handle('window:is-maximized', event => trustedWindow(event).isMaximized());

app.whenReady().then(async () => {
  reportSmoke({ event: 'smoke-progress', stage: 'electron-ready' });
  app.setAppUserModelId('com.eintheater.desktop');
  Menu.setApplicationMenu(null);
  const token = randomBytes(32).toString('hex');
  try {
    serverUrl = await startServer(token);
    reportSmoke({ event: 'smoke-progress', stage: 'server-ready', serverUrl });
    installSecurity(token);
    createWindow();
  } catch (error) {
    reportSmoke({ event: 'smoke-error', stage: 'startup', error: error.stack || error.message });
    dialog.showErrorBox('Ein Theater could not start', error.stack || error.message);
    allowQuit = true;
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (allowQuit || !serverProcess) return;
  event.preventDefault();
  allowQuit = true;
  logShutdown('go-stop-requested');
  saveWindowState();
  const child = serverProcess;
  const force = setTimeout(() => { logShutdown('go-stop-timeout'); child.kill(); app.quit(); }, 5500);
  child.once('exit', () => { clearTimeout(force); logShutdown('go-stopped'); app.quit(); });
  try { child.stdin.end(); } catch (error) { console.error('Could not stop Go server:', error); clearTimeout(force); child.kill(); app.quit(); }
});
