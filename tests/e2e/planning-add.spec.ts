import { expect, type Page, test } from '@playwright/test';
import { connectE2e, go, setupHousehold } from './helpers';

async function setupEmpty(page: Page) {
  await connectE2e(page, 'empty');
  await setupHousehold(page);
}

async function createGoal(page: Page) {
  await go(page, '#/ziel/neu');
  await page.getByLabel('Name', { exact: true }).fill('Ziel A');
  await page.getByLabel('Zielbetrag').fill('1000');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page).toHaveURL(/#\/(planung|ziel\/[^/]+)$/);
  await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toHaveCount(0);
}

async function createFixed(page: Page) {
  await go(page, '#/fixkosten/neu');
  await page.getByLabel('Name', { exact: true }).fill('Abo A');
  await page.getByLabel('Betrag', { exact: true }).fill('15');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page).toHaveURL(/#\/planung$/);
}

async function createIncome(page: Page) {
  await go(page, '#/einnahme/neu');
  await page.getByLabel('Name', { exact: true }).fill('Gehalt A');
  await page.getByLabel('Betrag', { exact: true }).fill('3000');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page).toHaveURL(/#\/planung$/);
}

test.describe('Planung: Anlegen direkt aus der Liste', () => {
  test('leere Planung: Empty-State-Buttons führen direkt ins Formular', async ({ page }) => {
    await setupEmpty(page);
    await go(page, '#/planung');
    await expect(page.getByRole('heading', { level: 1, name: 'Planung' })).toBeVisible();
    // Kein „Neu“-Button mehr im Kopf, kein Zwischendialog.
    await expect(page.getByRole('button', { name: /^Neu/ })).toHaveCount(0);

    const cases: Array<[string, RegExp]> = [
      ['Erstes Ziel anlegen', /#\/ziel\/neu$/],
      ['Fixkosten anlegen', /#\/fixkosten\/neu$/],
      ['Einnahme anlegen', /#\/einnahme\/neu$/],
    ];
    for (const [name, url] of cases) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await go(page, '#/planung');
    }
  });

  test('mit Daten: die „+ …“-Links im Sektionskopf führen ins Formular', async ({ page }) => {
    await setupEmpty(page);
    await createGoal(page);
    await createFixed(page);
    await createIncome(page);
    await go(page, '#/planung');
    await expect(page.getByRole('button', { name: /^Neu/ })).toHaveCount(0);

    const cases: Array<[string, RegExp]> = [
      ['+ Ziel hinzufügen', /#\/ziel\/neu$/],
      ['+ Fixkosten hinzufügen', /#\/fixkosten\/neu$/],
      ['+ Einnahme hinzufügen', /#\/einnahme\/neu$/],
    ];
    for (const [name, url] of cases) {
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(url);
      await go(page, '#/planung');
    }
  });

  test('Projektion leer: Erklärung mit CTA, nach einer Einnahme Diagramm und Tabelle', async ({
    page,
  }) => {
    await setupEmpty(page);
    await go(page, '#/planung/projektion');
    await expect(page.getByText('Noch nichts zu projizieren')).toBeVisible();
    await expect(page.getByText(/Die Projektion rechnet aus/)).toBeVisible();
    await expect(page.getByRole('img', { name: /Kumulierter Überschuss/ })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);

    await page.getByRole('link', { name: 'Einnahme anlegen', exact: true }).click();
    await expect(page).toHaveURL(/#\/einnahme\/neu$/);
    await page.getByLabel('Name', { exact: true }).fill('Gehalt A');
    await page.getByLabel('Betrag', { exact: true }).fill('3000');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page).toHaveURL(/#\/planung$/);

    await go(page, '#/planung/projektion');
    await expect(page.getByText('Noch nichts zu projizieren')).toHaveCount(0);
    await expect(page.getByRole('img', { name: /Kumulierter Überschuss/ })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Cashflow pro Monat' })).toBeAttached();
  });
});
