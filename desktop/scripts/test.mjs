import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(desktop, '..', 'src');
const cache = path.join(desktop, 'build', 'go-cache');
mkdirSync(cache, { recursive: true });

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('go', ['test', './...'], source, { ...process.env, GOCACHE: cache });
for (const test of [
  'static/studio/navigation.test.mjs',
  'static/studio/menubar.test.mjs',
  'Code/static/editor.test.mjs',
  'Canvas/static/js/api.test.mjs',
  'Canvas/static/js/ui.test.mjs',
  'Canvas/static/js/performance.test.mjs',
  'Canvas/static/js/workspace/chooser.test.mjs'
]) run(process.execPath, [test], source);
run(process.execPath, ['--test', 'test/security.test.mjs'], desktop);
run(process.execPath, ['--test', 'test/code-mode.test.mjs'], desktop);
