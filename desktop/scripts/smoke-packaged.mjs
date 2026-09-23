import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(desktop, 'dist', 'win-unpacked', 'Ein Theater.exe');
const resultFile = path.join(desktop, 'build', 'smoke-result.json');
rmSync(resultFile, { force: true });
const child = spawn(executable, [], {
  windowsHide: true,
  env: { ...process.env, EIN_THEATER_SMOKE: '1', EIN_THEATER_SMOKE_RESULT: resultFile },
  stdio: 'ignore',
  detached: true
});
child.unref();
const deadline = Date.now() + 30000;
while (!existsSync(resultFile) && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 200));
}
if (!existsSync(resultFile)) throw new Error('Packaged app returned no smoke result within 30 seconds');
const smokeLine = readFileSync(resultFile, 'utf8');
const result = JSON.parse(smokeLine);
if (!result.hasDesktopBridge || result.hasLegacyFolderModal || result.health?.status !== 'ok') {
  throw new Error(`Packaged smoke assertions failed: ${smokeLine}`);
}
console.log(smokeLine);
