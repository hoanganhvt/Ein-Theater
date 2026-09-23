import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(desktop, '..', 'src');
const output = path.join(desktop, 'build', 'ein-theater-server.exe');
mkdirSync(path.dirname(output), { recursive: true });
const version = process.env.npm_package_version || '0.1.0';
const result = spawnSync('go', ['build', '-trimpath', '-ldflags', `-s -w -X main.version=${version}`, '-o', output, '.'], {
  cwd: source,
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, GOCACHE: path.join(desktop, 'build', 'go-cache') }
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
