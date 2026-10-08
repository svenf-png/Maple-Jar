// Prüft alle getrackten Textdateien gegen eine Denylist (Umgebungsvariable PRIVACY_DENYLIST
// oder lokale Datei .privacy-denylist, je Begriff eine Zeile). Gibt bei Treffern nur Datei
// und Zeilennummer aus, nie den gefundenen Begriff.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function loadTerms() {
  let raw = process.env.PRIVACY_DENYLIST ?? '';
  if (!raw.trim() && existsSync('.privacy-denylist'))
    raw = readFileSync('.privacy-denylist', 'utf8');
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
}

const terms = loadTerms();
if (terms.length === 0) {
  console.warn(
    'Warnung: Keine Denylist gefunden (PRIVACY_DENYLIST oder .privacy-denylist). Prüfung übersprungen.',
  );
  process.exit(0);
}

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

let hits = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const buf = readFileSync(file);
  if (buf.includes(0)) continue; // Binärdatei
  const lines = buf.toString('utf8').toLowerCase().split('\n');
  lines.forEach((line, i) => {
    if (terms.some((t) => line.includes(t))) {
      hits++;
      console.error(`${file}:${i + 1}`);
    }
  });
}

if (hits > 0) {
  console.error(
    `Privacy-Check fehlgeschlagen: ${hits} Treffer (Begriffe werden bewusst nicht ausgegeben).`,
  );
  process.exit(1);
}
console.log(`Privacy-Check ok (${files.length} Dateien, ${terms.length} Begriffe).`);
