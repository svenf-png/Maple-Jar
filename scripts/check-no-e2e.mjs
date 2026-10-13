// Stellt sicher, dass der E2E-Testmodus (MemoryStore-Schalter, Testdaten) nicht im Produktions-Build steckt.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const markers = [
  'e2e-pass',
  'Testhaushalt',
  'person-a',
  'maple-jar.e2e',
  'e2e-project',
  '__e2e',
  'e2e-seed',
];
const dir = join('dist', 'assets');
let bad = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
  const text = readFileSync(join(dir, f), 'utf8');
  for (const m of markers) {
    if (text.includes(m)) {
      console.error(`E2E-Rest im Build: ${f} enthält "${m}"`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log('Kein E2E-Code im Produktions-Build.');
