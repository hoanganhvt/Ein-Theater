import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageConfig = JSON.parse(readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const resources = new Map(packageConfig.build.extraResources.map(item => [item.to, item.from]));
for (const name of ['Code/templates', 'Code/static', 'Code/utils']) {
  assert.equal(resources.get(`app-src/${name}`), `../src/${name}`);
  assert.ok(existsSync(path.join(desktop, '..', 'src', name)));
}
assert.ok(existsSync(path.join(desktop, '..', 'src', 'Code', 'utils', 'compile.py')));
assert.match(readFileSync(path.join(desktop, 'main.cjs'), 'utf8'), /result\.codeMode/);
console.log('Desktop Code mode resource checks passed');
