import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(desktop, 'dist', 'win-unpacked', 'Ein Theater.exe');
const resultFile = path.join(desktop, 'build', 'smoke-result.json');
const screenshotFile = path.join(desktop, 'build', 'smoke-window.png');
const dirtyClose = process.argv.includes('--dirty');
const canvasClose = process.argv.includes('--canvas');
rmSync(resultFile, { force: true });
rmSync(screenshotFile, { force: true });
const smokeRoot = mkdtempSync(path.join(os.tmpdir(), 'ein-theater-smoke-'));
const smokeWorkspace = path.join(smokeRoot, 'Workspace Tiếng Việt');
mkdirSync(smokeWorkspace);
mkdirSync(path.join(smokeRoot, 'app-data'));
const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...cleanEnv } = process.env;
const child = spawn(executable, [], {
  windowsHide: true,
  env: { ...cleanEnv, EIN_THEATER_SMOKE: '1', EIN_THEATER_SMOKE_DIRTY: dirtyClose ? '1' : '0',
    EIN_THEATER_SMOKE_CANVAS: canvasClose ? '1' : '0', EIN_THEATER_SMOKE_RESULT: resultFile,
    EIN_THEATER_SMOKE_USER_DATA: path.join(smokeRoot, 'app-data'), EIN_THEATER_SMOKE_FOLDER: smokeWorkspace,
    EIN_THEATER_SMOKE_SCREENSHOT: screenshotFile },
  stdio: ['ignore', 'pipe', 'pipe']
});
let childOutput = '';
child.stdout.on('data', chunk => { childOutput += chunk.toString(); });
child.stderr.on('data', chunk => { childOutput += chunk.toString(); });
const exited = new Promise(resolve => child.once('exit', resolve));
const deadline = Date.now() + 60000;
let result;
while (Date.now() < deadline) {
  if (existsSync(resultFile)) {
    try {
      result = JSON.parse(readFileSync(resultFile, 'utf8'));
      if (result.event === 'smoke' || result.event === 'smoke-error') break;
    } catch (_) {}
  }
  if (child.exitCode !== null) break;
  await new Promise(resolve => setTimeout(resolve, 200));
}
// The app can write its final result and exit between two polls.
if (existsSync(resultFile)) {
  try { result = JSON.parse(readFileSync(resultFile, 'utf8')); } catch (_) {}
}
if (!result || result.event === 'smoke-progress') throw new Error(`Packaged app returned no final smoke result within 60 seconds (last stage: ${result?.stage || 'none'}, exit: ${child.exitCode}, output: ${childOutput.slice(-3000)})`);
const smokeLine = JSON.stringify(result);
if (!result.hasDesktopBridge || result.hasLegacyFolderModal || result.hasNativeMenu ||
    !result.hasCustomWindowControls || !result.hasVisNetwork || !result.hasCanvasNetwork ||
    JSON.stringify(result.windowStateCycle) !== JSON.stringify([false, true, false]) ||
    result.selectedWorkspace !== smokeWorkspace ||
    result.health?.status !== 'ok' || result.health?.mode !== 'desktop' ||
    !result.hasCodeConverter || !result.closeVerified ||
    (!canvasClose && (result.codeMode?.page !== 'code' || !result.codeMode?.hasEditor ||
    !result.codeMode?.hasCompile || !result.codeMode?.hasPythonConfig ||
    !result.codeMode?.hasWindowControls || !result.codeMode?.fileRoundTrip)) ||
    (dirtyClose && (!result.cancelKeptWindow || !result.cancelKeptServer || !result.confirmedDiscard))) {
  throw new Error(`Packaged smoke assertions failed: ${smokeLine}`);
}
let stopTimer;
const stopped = await Promise.race([exited.then(() => true), new Promise(resolve => {
  stopTimer = setTimeout(() => resolve(false), 8000);
})]);
clearTimeout(stopTimer);
if (!stopped) {
  child.kill();
  await exited;
  throw new Error(`App did not exit after Close (output: ${childOutput.slice(-3000)})`);
}
if (child.exitCode !== 0) throw new Error(`App exited with code ${child.exitCode}: ${childOutput.slice(-3000)}`);
try {
  process.kill(result.serverPid, 0);
  throw new Error(`Go server ${result.serverPid} remained running after app exit`);
} catch (error) {
  if (error.code !== 'ESRCH') throw error;
}
const shutdownLog = readFileSync(path.join(smokeRoot, 'app-data', 'shutdown.log'), 'utf8');
for (const stage of [...(canvasClose ? [] : ['close-ipc']), 'window-close', 'window-closed', 'go-stop-requested', 'go-stopped']) {
  if (!shutdownLog.includes(stage)) throw new Error(`Missing shutdown stage ${stage}: ${shutdownLog}`);
}
if (dirtyClose && !shutdownLog.includes('beforeunload-blocked')) throw new Error(`Unsaved Code did not block close: ${shutdownLog}`);
const bounds = JSON.parse(readFileSync(path.join(smokeRoot, 'app-data', 'window-state.json'), 'utf8'));
const session = JSON.parse(readFileSync(path.join(smokeRoot, 'app-data', 'session-v1.json'), 'utf8'));
if (bounds.width < 800 || bounds.height < 600 || session.workingDir !== smokeWorkspace) {
  throw new Error('Window bounds or workspace session were not saved on close');
}
console.log(smokeLine);
console.log(`Screenshot ${screenshotFile}`);
const resolvedRoot = realpathSync(smokeRoot);
const resolvedTemp = realpathSync(os.tmpdir());
if (!resolvedRoot.startsWith(resolvedTemp + path.sep)) throw new Error(`Unsafe smoke cleanup path: ${resolvedRoot}`);
rmSync(resolvedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
