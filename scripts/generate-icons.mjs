// Einmalig ausführen: erzeugt die PWA-PNGs aus public/logo.svg. Die PNGs werden committet.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BG = '#B8322A';
const inner = (await readFile('public/logo.svg', 'utf8')).match(
  /<g transform="translate\(2.4 2.4\) scale\(.8\)">([\s\S]*)<\/g>\s*<\/svg>/,
)?.[1];
if (!inner) throw new Error('logo.svg hat ein unerwartetes Format');

function svg({ size, radius, scale }) {
  const off = (24 - 24 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
<rect width="24" height="24" rx="${radius}" fill="${BG}"/>
<g transform="translate(${off} ${off}) scale(${scale})">${inner}</g></svg>`;
}

const targets = [
  { file: 'pwa-192x192.png', size: 192, radius: 5.5, scale: 0.8 },
  { file: 'pwa-512x512.png', size: 512, radius: 5.5, scale: 0.8 },
  // Sicherheitsrand: Motiv im inneren 60 % Kreis, Hintergrund vollflächig
  { file: 'maskable-512x512.png', size: 512, radius: 0, scale: 0.6 },
  // iOS rundet selbst ab, keine Transparenz
  { file: 'apple-touch-icon.png', size: 180, radius: 0, scale: 0.8 },
];

await mkdir('public', { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size } });
  await page.setContent(`<body style="margin:0;background:${BG}">${svg(t)}</body>`);
  await writeFile(`public/${t.file}`, await page.screenshot({ omitBackground: false }));
  await page.close();
}
await browser.close();
