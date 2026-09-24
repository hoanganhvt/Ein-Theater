import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...cleanEnv } = process.env;
const electron = path.join(desktop, 'node_modules', 'electron', 'dist', 'electron.exe');
const child = spawn(electron, ['.'], { cwd: desktop, env: cleanEnv, stdio: 'inherit', windowsHide: true });
child.once('error', error => { throw error; });
child.once('exit', code => { process.exitCode = code ?? 1; });
