import { type ChildProcess, spawn } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  captureEntry,
  connectE2e,
  go,
  historyItem,
  overviewHeading,
  setupHousehold,
  waitForAnimations,
} from './helpers';

/*
 * Update-Ablauf: Eine neue Version meldet die App mit einem Hinweis, statt still neu zu laden.
 * Der Test liefert eine Kopie von dist/ auf einem eigenen Port aus (das gemeinsame dist/ bleibt
 * unberührt, die übrigen Specs laufen parallel dagegen), ändert dort die sw.js (neuer Worker,
 * byte-verschieden) und prüft den ganzen Weg: Hinweis, kein automatischer Reload, „Später“,
 * erneuter Hinweis nach dem Neustart, „Neu laden“, Daten bleiben.
 */

const PORT = 4180;
test.use({ baseURL: `http://localhost:${PORT}/` });

let server: ChildProcess | undefined;
let copy = '';

/** Startet `vite preview` mit einer Kopie von dist/ und wartet auf die Adresse. */
async function startServer(): Promise<void> {
  copy = mkdtempSync(join(tmpdir(), 'maple-jar-update-'));
  cpSync('dist', copy, { recursive: true });
  const child = spawn(
    'node_modules/.bin/vite',
    ['preview', '--outDir', copy, '--port', String(PORT), '--strictPort'],
    // Ohne Farbcodes, sonst steht die Adresse nicht als zusammenhängender Text in der Ausgabe.
    { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, NO_COLOR: '1' } },
  );
  server = child;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Der Testserver ist nicht gestartet.')),
      20_000,
    );
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Der Testserver endete vorzeitig (Code ${code}).`));
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes('localhost:') && text.includes(String(PORT))) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/** Beendet den Server, wartet (begrenzt) auf sein Ende, damit der Port frei ist, und räumt auf. */
async function stopServer(): Promise<void> {
  const child = server;
  server = undefined;
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 5_000);
    });
    await Promise.race([exited, limit]);
    clearTimeout(timer);
  }
  if (copy) rmSync(copy, { recursive: true, force: true });
  copy = '';
}

test.beforeAll(startServer);
// Auch nach einem fehlgeschlagenen Start aufräumen, sonst scheitert der Retry an --strictPort.
test.afterAll(stopServer);

test('Neue Version: Hinweis statt stillem Reload, „Später“, „Neu laden“, Daten bleiben', async ({
  page,
}) => {
  test.setTimeout(120_000);
  {
    await connectE2e(page, 'empty');
    await setupHousehold(page);
    await captureEntry(page, {
      amount: '12,50',
      category: 'Lebensmittel',
      merchant: 'Supermarkt A',
    });
    await go(page, '#/');
    await expect(overviewHeading(page)).toBeVisible();

    // Erste Installation: Der Worker ist aktiv und steuert die Seite (nach einem Neustart).
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(overviewHeading(page)).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    const prompt = page.getByRole('status').filter({ hasText: 'Neue Version verfügbar' });
    await expect(prompt).toHaveCount(0);

    // Eine neue Version erscheint: byte-verschiedene sw.js am Server.
    await page.evaluate(() => {
      (window as unknown as { __alive: boolean }).__alive = true;
    });
    appendFileSync(join(copy, 'sw.js'), '\n// Update-Test: neue Version\n');
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await expect(prompt).toBeVisible({ timeout: 30_000 });
    await expect(prompt).toContainText('Deine Daten bleiben erhalten.');
    // Kein automatischer Reload: Die Seite lebt weiter.
    expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(
      true,
    );

    // Auf dem Vollbild-Formular (ohne Tab-Leiste) bleibt der Hinweis zurück und kommt danach wieder.
    await go(page, '#/erfassen');
    await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
    await expect(prompt).toHaveCount(0);
    await go(page, '#/');
    await expect(overviewHeading(page)).toBeVisible();
    await expect(prompt).toBeVisible();

    // Der Hinweis erscheint auch auf anderen Seiten (Einstellungen), ohne den Fokus zu verschieben.
    await go(page, '#/einstellungen');
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
    await expect(prompt).toBeVisible();
    await go(page, '#/');
    await expect(overviewHeading(page)).toBeVisible();

    // Barrierefreiheit in Hell und Dunkel, ohne Ausnahmen.
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(prompt).toBeVisible();
      await waitForAnimations(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map(
          (v) => `${scheme} ${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`,
        ),
      ).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // „Später“ blendet den Hinweis aus, die Seite bleibt unverändert.
    await prompt.getByRole('button', { name: 'Später' }).click();
    await expect(prompt).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(
      true,
    );

    // Nach dem Neustart wartet die neue Version noch: Der Hinweis kommt wieder.
    await page.reload();
    await expect(prompt).toBeVisible({ timeout: 30_000 });

    // „Neu laden“ übernimmt die neue Version und lädt die Seite neu.
    await page.evaluate(() => {
      (window as unknown as { __alive: boolean }).__alive = true;
    });
    await Promise.all([
      page.waitForEvent('load', { timeout: 30_000 }),
      prompt.getByRole('button', { name: 'Neu laden' }).click(),
    ]);
    await expect(overviewHeading(page)).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive),
    ).toBeUndefined();
    await expect(prompt).toHaveCount(0);
    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return {
        waiting: registration?.waiting != null,
        installing: registration?.installing != null,
      };
    });
    expect(state).toEqual({ waiting: false, installing: false });

    // Der vorher erfasste Eintrag ist noch da.
    await go(page, '#/verlauf');
    await expect(historyItem(page, /Supermarkt A/)).toBeVisible();
  }
});
