// Größenbudget für das initiale JavaScript (gzip). Liest dist/index.html.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 150;
const indexPath = join('dist', 'index.html');
const html = readFileSync(indexPath, 'utf8');

const refs = new Set();
for (const m of html.matchAll(/<(script|link)\b[^>]*>/g)) {
  const tag = m[0];
  const isScript = m[1] === 'script';
  const isPreload = /rel=["']modulepreload["']/.test(tag);
  if (!isScript && !isPreload) continue;
  const src = /(?:src|href)=["']([^"']+)["']/.exec(tag)?.[1];
  if (src?.endsWith('.js')) refs.add(src);
}

const rows = [];
let total = 0;
for (const ref of refs) {
  const clean = ref.replace(/^.*?(assets\/)/, '$1');
  const file = join(dirname(indexPath), clean);
  const gz = gzipSync(readFileSync(file)).length;
  total += gz;
  rows.push([clean, gz]);
}

const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
console.log('Initiales JavaScript (gzip)');
for (const [name, gz] of rows) console.log(`  ${name.padEnd(48)} ${kb(gz).padStart(10)}`);
console.log(`  ${'Summe'.padEnd(48)} ${kb(total).padStart(10)}  (Budget ${BUDGET_KB} KB)`);

if (rows.length === 0) {
  console.error('Keine JS-Dateien in dist/index.html gefunden.');
  process.exit(1);
}
if (total > BUDGET_KB * 1024) {
  console.error('Größenbudget überschritten.');
  process.exit(1);
}
