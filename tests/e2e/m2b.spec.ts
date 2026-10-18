import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  captureEntry,
  connectE2e,
  go,
  historyItem,
  overviewHeading,
  settleForAxe,
  setupHousehold,
} from './helpers';

async function ready(page: Page) {
  await connectE2e(page, 'empty');
  await setupHousehold(page);
  // Kategorien aus der Vorlage sind angelegt
  await go(page, '#/kategorien');
  await expect(page.getByText('Lebensmittel', { exact: true })).toBeVisible();
  await go(page, '#/');
  await expect(overviewHeading(page)).toBeVisible();
}

const rate = (page: Page, value = 1.5) =>
  page.route('https://api.frankfurter.dev/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ date: '2027-01-02', base: 'EUR', quote: 'CAD', rate: value }),
    }),
  );

test('Erfassen: Betrag über den Ziffernblock, Eintrag erscheint in Übersicht und Verlauf', async ({
  page,
}) => {
  await ready(page);
  await expect(page.getByText('Willkommen', { exact: false })).toBeVisible();
  await captureEntry(page, { amount: '84,17', category: 'Lebensmittel', merchant: 'Supermarkt A' });
  await go(page, '#/');
  await expect(page.getByRole('heading', { name: 'Letzte Einträge' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Supermarkt A/ })).toContainText('84,17');
  await go(page, '#/verlauf');
  await expect(page.getByRole('link', { name: /Supermarkt A/ })).toBeVisible();
});

test('Erfassen: Kategorie-Vorschlag aus der Historie', async ({ page }) => {
  await ready(page);
  await captureEntry(page, { amount: '10', category: 'Freizeit und Ausflüge', merchant: 'Café B' });
  await go(page, '#/erfassen');
  await page.getByLabel('Händler oder Notiz (optional)').fill('Café B');
  await expect(page.getByText('Vorschlag aus 1 früheren Einkauf')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Freizeit und Ausflüge' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('EUR-Betrag wird mit Tageskurs nach CAD umgerechnet', async ({ page }) => {
  await rate(page, 1.5);
  await ready(page);
  await captureEntry(page, {
    amount: '10',
    category: 'Lebensmittel',
    merchant: 'Euro-Laden',
    currency: 'EUR',
  });
  await go(page, '#/verlauf');
  const row = historyItem(page, /Euro-Laden/);
  await expect(row).toContainText('15,00');
  await expect(row).toContainText('10,00');
  await expect(row).not.toContainText('Vorläufiger Kurs');
});

test('Offline erfassen und nach der Rückkehr synchronisieren', async ({ page, context }) => {
  await ready(page);
  // Seiten-Bausteine vorher laden (im Betrieb liefert sie der Service Worker aus dem Cache)
  await go(page, '#/erfassen');
  await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
  await go(page, '#/verlauf');
  await expect(page.getByRole('button', { name: 'Aktivität' })).toBeVisible();
  // Verlauf einmal online mit einem Eintrag öffnen, damit die Tabellen-Chunks (Desktop) im Cache liegen.
  await captureEntry(page, { amount: '3,00', category: 'Lebensmittel', merchant: 'Bäcker A' });
  await go(page, '#/verlauf');
  await expect(historyItem(page, /Bäcker A/)).toBeVisible();
  await go(page, '#/');
  await context.setOffline(true);
  await captureEntry(page, { amount: '12,50', category: 'Lebensmittel', merchant: 'Kiosk' });
  await go(page, '#/verlauf');
  await expect(page.getByRole('link', { name: /Kiosk/ })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await expect(page.getByText(/Offline|warten auf Sync/).first()).toBeVisible();
  }
  await context.setOffline(false);
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await expect(page.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 15_000 });
  }
  const pending = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('maple-jar');
        open.onsuccess = () => {
          const tx = open.result.transaction('outbox');
          const req = tx.objectStore('outbox').count();
          req.onsuccess = () => resolve(req.result);
        };
      }),
  );
  expect(pending).toBe(0);
});

test('Budget: ab 80 % und über 100 % Amber mit Icon und Text', async ({ page }) => {
  await ready(page);
  await go(page, '#/budgets');
  await page.getByRole('button', { name: 'Limit festlegen: Lebensmittel' }).click();
  await page.getByLabel('Monatslimit in CAD').fill('100');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await captureEntry(page, { amount: '85', category: 'Lebensmittel' });
  await go(page, '#/budgets');
  const near = page.getByText('85 % erreicht');
  await expect(near).toBeVisible();
  expect(await near.evaluate((el) => el.querySelector('svg') !== null)).toBe(true);
  await captureEntry(page, { amount: '20', category: 'Lebensmittel' });
  await go(page, '#/budgets');
  await expect(page.getByText(/Budget um .* überschritten/)).toBeVisible();
  await go(page, '#/');
  await expect(page.getByText('Über Budget')).toBeVisible();
});

test('Löschen mit Rückgängig', async ({ page }) => {
  await ready(page);
  await captureEntry(page, { amount: '9,45', category: 'Lebensmittel', merchant: 'Imbiss' });
  await go(page, '#/verlauf');
  await page.getByRole('link', { name: /Imbiss/ }).click();
  await page.getByRole('button', { name: 'Eintrag löschen' }).click();
  await expect(page.getByText('Eintrag gelöscht')).toBeVisible();
  await expect(page.getByRole('link', { name: /Imbiss/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByRole('link', { name: /Imbiss/ })).toBeVisible();
});

test('Bearbeiten ändert den Betrag, die Historie zeigt es', async ({ page }) => {
  await ready(page);
  await captureEntry(page, { amount: '81,17', category: 'Lebensmittel', merchant: 'Supermarkt A' });
  await go(page, '#/verlauf');
  await page.getByRole('link', { name: /Supermarkt A/ }).click();
  await page.getByRole('link', { name: 'Bearbeiten' }).click();
  await expect(page.getByRole('heading', { name: 'Ausgabe bearbeiten' })).toBeVisible();
  // Betrag: drei Mal löschen, dann neu
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Letzte Ziffer löschen' }).click();
  for (const ch of '84') await page.getByRole('button', { name: ch, exact: true }).click();
  await page
    .getByRole('button', { name: ',', exact: true })
    .or(page.getByRole('button', { name: '.', exact: true }))
    .click();
  for (const ch of '17') await page.getByRole('button', { name: ch, exact: true }).click();
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('84,17').first()).toBeVisible();
  await expect(page.getByText(/hat den Betrag von .*81,17.* auf .*84,17/)).toBeVisible();
});

test('Verlauf: Suche und Aktivitäts-Tab', async ({ page }) => {
  await ready(page);
  await captureEntry(page, { amount: '5', category: 'Lebensmittel', merchant: 'Bäckerei' });
  await captureEntry(page, { amount: '6', category: 'Lebensmittel', merchant: 'Kiosk' });
  await go(page, '#/verlauf');
  await page.getByLabel('Händler, Notiz, Betrag').fill('back');
  await expect(page.getByRole('link', { name: /Bäckerei/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Kiosk/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Aktivität' }).click();
  await expect(page.getByText(/Person A hat Bäckerei, .*5,00.* hinzugefügt/)).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe Teil B (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('Erfassen, Übersicht, Verlauf, Budgets, Kategorien, Detail', async ({ page }) => {
      await rate(page);
      await ready(page);
      await go(page, '#/budgets');
      await page.getByRole('button', { name: 'Limit festlegen: Lebensmittel' }).click();
      await page.getByLabel('Monatslimit in CAD').fill('100');
      await page.getByRole('button', { name: 'Speichern' }).click();
      await captureEntry(page, {
        amount: '85',
        category: 'Lebensmittel',
        merchant: 'Supermarkt A',
      });
      const check = async (label: string) => {
        await settleForAxe(page);
        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations.map(
            (v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`,
          ),
        ).toEqual([]);
      };
      await go(page, '#/erfassen');
      await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
      await check('erfassen');
      await go(page, '#/');
      await expect(page.getByRole('heading', { name: 'Letzte Einträge' })).toBeVisible();
      await check('übersicht');
      await go(page, '#/verlauf');
      await expect(page.getByRole('link', { name: /Supermarkt A/ })).toBeVisible();
      await check('verlauf');
      await page.getByRole('button', { name: 'Aktivität' }).click();
      await check('aktivität');
      await go(page, '#/budgets');
      await expect(page.getByText('85 % erreicht')).toBeVisible();
      await check('budgets');
      await go(page, '#/kategorien');
      await expect(page.getByRole('heading', { name: 'Kategorien' })).toBeVisible();
      await check('kategorien');
      await go(page, '#/verlauf');
      await page.getByRole('button', { name: 'Einträge' }).click();
      await page.getByRole('link', { name: /Supermarkt A/ }).click();
      await expect(page.getByText('Änderungshistorie')).toBeVisible();
      await check('detail');
    });
  });
}
