import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const preload = readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8');
assert.match(preload, /selectDirectory/);
assert.match(preload, /selectPythonExecutable/);
assert.match(preload, /windowControls/);
assert.doesNotMatch(preload, /require\(['"](?:node:)?fs/);
assert.doesNotMatch(preload, /process\./);

const main = readFileSync(new URL('../main.cjs', import.meta.url), 'utf8');
assert.match(main, /contextIsolation:\s*true/);
assert.match(main, /nodeIntegration:\s*false/);
assert.match(main, /sandbox:\s*true/);
assert.match(main, /frame:\s*false/);
assert.match(main, /Menu\.setApplicationMenu\(null\)/);
assert.match(main, /openDirectory/);
assert.match(main, /X-Ein-Theater-Token/);

console.log('Electron preload and window security checks passed');
