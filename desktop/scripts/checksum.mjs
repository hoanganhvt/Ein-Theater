import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = 'Ein-Theater-Setup-0.1.0.exe';
const file = path.join(desktop, 'dist', name);
const digest = createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase();
writeFileSync(path.join(desktop, 'dist', `${name}.sha256`), `${digest}  ${name}\n`);
console.log(`SHA256 ${digest}`);
