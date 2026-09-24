import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(desktop, 'dist', 'win-unpacked', 'Ein Theater.exe');
const resultFile = path.join(desktop, 'build', 'smoke-result.json');
const screenshotFile = path.join(desktop, 'build', 'smoke-window.png');
rmSync(resultFile, { force: true });
rmSync(screenshotFile, { force: true });
const smokeRoot = mkdtempSync(path.join(os.tmpdir(), 'ein-theater-smoke-'));
const smokeWorkspace = path.join(smokeRoot, 'Workspace Tiếng Việt');
mkdirSync(smokeWorkspace);
mkdirSync(path.join(smokeRoot, 'app-data'));
const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...cleanEnv } = process.env;
const child = spawn(executable, [], {
  windowsHide: true,
  env: { ...cleanEnv, EIN_THEATER_SMOKE: '1', EIN_THEATER_SMOKE_RESULT: resultFile,
    EIN_THEATER_SMOKE_USER_DATA: path.join(smokeRoot, 'app-data'), EIN_THEATER_SMOKE_FOLDER: smokeWorkspace,
    EIN_THEATER_SMOKE_SCREENSHOT: screenshotFile },
  stdio: 'ignore'
});
const exited = new Promise(resolve => child.once('exit', resolve));
const deadline = Date.now() + 30000;
let result;
while (Date.now() < deadline) {
  if (existsSync(resultFile)) {
    try {
      result = JSON.parse(readFileSync(resultFile, 'utf8'));
      if (result.event === 'smoke' || result.event === 'smoke-error') break;
    } catch (_) {}
  }
  await new Promise(resolve => setTimeout(resolve, 200));
}
if (!result || result.event === 'smoke-progress') throw new Error('Packaged app returned no final smoke result within 30 seconds');
const smokeLine = JSON.stringify(result);
if (!result.hasDesktopBridge || result.hasLegacyFolderModal || result.hasNativeMenu ||
    !result.hasCustomWindowControls || !result.hasVisNetwork || !result.hasCanvasNetwork ||
    JSON.stringify(result.windowStateCycle) !== JSON.stringify([false, true, false]) ||
    result.selectedWorkspace !== smokeWorkspace ||
    result.health?.status !== 'ok' || result.health?.mode !== 'desktop') {
  throw new Error(`Packaged smoke assertions failed: ${smokeLine}`);
}
console.log(smokeLine);
console.log(`Screenshot ${screenshotFile}`);
let stopTimer;
const stopped = await Promise.race([exited.then(() => true), new Promise(resolve => {
  stopTimer = setTimeout(() => resolve(false), 8000);
})]);
clearTimeout(stopTimer);
if (!stopped) {
  child.kill();
  await exited;
}
const resolvedRoot = realpathSync(smokeRoot);
const resolvedTemp = realpathSync(os.tmpdir());
if (!resolvedRoot.startsWith(resolvedTemp + path.sep)) throw new Error(`Unsafe smoke cleanup path: ${resolvedRoot}`);
rmSync(resolvedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
