import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(desktop, 'runtime-static', 'vendor');
mkdirSync(vendor, { recursive: true });
const copies = [
  ['vis-network/standalone/umd/vis-network.min.js', 'vis-network.min.js'],
  ['@fontsource/inter/files/inter-latin-400-normal.woff2', 'inter-latin-400-normal.woff2'],
  ['@fontsource/inter/files/inter-latin-500-normal.woff2', 'inter-latin-500-normal.woff2'],
  ['@fontsource/inter/files/inter-latin-600-normal.woff2', 'inter-latin-600-normal.woff2'],
  ['@fontsource/inter/files/inter-latin-700-normal.woff2', 'inter-latin-700-normal.woff2']
];
for (const [source, target] of copies) {
  copyFileSync(path.join(desktop, 'node_modules', source), path.join(vendor, target));
}
mkdirSync(path.join(desktop, 'build'), { recursive: true });
await sharp(path.join(desktop, 'assets', 'icon.svg')).resize(512, 512).png().toFile(path.join(desktop, 'build', 'icon.png'));
