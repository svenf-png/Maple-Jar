import AxeBuilder from '@axe-core/playwright';
import { type Browser, type BrowserContext, expect, test } from '@playwright/test';
import { createSharedServer } from './fake-supabase-route';
import { PERSON_A } from './fixtures/household';
import {
  captureEntry,
  fillConnect,
  go,
  overviewHeading,
  setupHousehold,
  waitForAnimations,
} from './helpers';

test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const contexts: BrowserContext[] = [];

/** Ein Gerät mit eigenem Kontext; der Server ist für alle Tests dieser Datei gleich aufgebaut. */
async function startDevice(
  browser: Browser,
  opts: { colorScheme?: 'light' | 'dark'; viewport?: { width: number; height: number } } = {},
) {
  const { server, install } = createSharedServer();
  const context = await browser.newContext({
    locale: 'de-DE',
    serviceWorkers: 'block',
    viewport: opts.viewport ?? { width: 390, height: 844 },
    colorScheme: opts.colorScheme ?? 'light',
  });
  contexts.push(context);
  await install(context);
  const page = await context.newPage();
  await page.goto('/#/verbinden');
  await fillConnect(page, PERSON_A);
  await setupHousehold(page);
  await expect(overviewHeading(page)).toBeVisible();
  return { server, context, page };
}

test.afterEach(async () => {
  for (const c of contexts.splice(0)) await c.close();
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Abmelden (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test('Abmelden mit wartendem Eintrag warnt mit Anzahl und behält die Daten', async ({
      browser,
    }) => {
      const { context, page } = await startDevice(browser, { colorScheme: scheme });
      await go(page, '#/erfassen');
      await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
      await go(page, '#/einstellungen');
      await go(page, '#/');
      await context.setOffline(true);
      await captureEntry(page, { amount: '12,50', category: 'Lebensmittel', merchant: 'Café B' });
      await go(page, '#/einstellungen');

      const logout = page.getByRole('button', { name: 'Abmelden', exact: true });
      const dialog = page.getByRole('dialog');
      await logout.click();
      await expect(dialog).toContainText('Noch nicht synchronisiert: 1');
      expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(
        scheme === 'dark',
      );
      await waitForAnimations(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
      ).toEqual([]);

      // Abbrechen behält die Daten
      await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/#\/einstellungen$/);
      await expect(
        page.getByText('Offline · 1 warten auf Sync', { exact: true }).filter({ visible: true }),
      ).toBeVisible();

      // „Erst synchronisieren“ schließt den Dialog und löscht nichts (offline bleibt der Eintrag wartend)
      await logout.click();
      await dialog.getByRole('button', { name: 'Erst synchronisieren', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/#\/einstellungen$/);

      // Online: nach dem Sync erscheint der normale Dialog
      await context.setOffline(false);
      await expect(page.getByRole('button', { name: 'Synchronisiert' })).toBeVisible({
        timeout: 20_000,
      });
      await logout.click();
      await expect(dialog).toContainText('Zugangsdaten und alle lokalen Daten');
      await expect(dialog).not.toContainText('Noch nicht synchronisiert');
      await expect(dialog.getByRole('button', { name: 'Erst synchronisieren' })).toHaveCount(0);
    });
  });
}
