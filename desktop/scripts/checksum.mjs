import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const name = `Ein-Theater-Setup-${version}.exe`;
const file = path.join(desktop, 'dist', name);
const digest = createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase();
writeFileSync(path.join(desktop, 'dist', `${name}.sha256`), `${digest}  ${name}\n`);
console.log(`SHA256 ${digest}`);
