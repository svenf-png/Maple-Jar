import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { todayIso } from '../../src/data/today';
import { addDays } from '../../src/domain/schedule';
import {
  captureEntry,
  connectE2e,
  go,
  seedLastMonthEntry,
  setupHousehold,
  waitForAnimations,
} from './helpers';

const DESKTOP = { width: 1280, height: 900 };

/** Erster Tag des Folgemonats als `YYYY-MM-DD` (lokal). */
function firstOfNextMonth(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Haushalt mit einer Lebensmittel-Ausgabe im Vormonat (Ø 500,00 CAD über die letzten 3 Monate). */
async function setupSeeded(page: Page) {
  await connectE2e(page, 'empty');
  await setupHousehold(page);
  await seedLastMonthEntry(page, '500,00', 'Supermarkt A');
}

/** Projektion öffnen, über die Planungs-Tabs. */
async function openProjection(page: Page) {
  await go(page, '#/planung');
  await page.getByRole('link', { name: 'Projektion', exact: true }).click();
  await expect(page).toHaveURL(/#\/planung\/projektion$/);
  await expect(page.getByRole('slider', { name: /Lebensmittel/ })).toBeVisible();
}

const lebensmittel = (page: Page) => page.getByRole('slider', { name: /Lebensmittel/ });

test.describe('M4 Teil B Desktop', () => {
  test.use({ viewport: DESKTOP });

  test('Projektion öffnen: Diagramm und Cashflow-Tabelle sind sichtbar', async ({ page }) => {
    await setupSeeded(page);
    await go(page, '#/planung');
    await page.getByRole('link', { name: 'Projektion', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Planung' })).toBeVisible();
    await expect(page.getByText('Freier Überschuss Ende')).toBeVisible();
    await expect(page.getByRole('img', { name: /Kumulierter Überschuss/ })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Cashflow pro Monat' })).toBeVisible();
  });

  test('Regler auf −20 %: Szenario-Differenz positiv, Wert bleibt nach Neuladen', async ({
    page,
  }) => {
    await setupSeeded(page);
    await openProjection(page);
    await lebensmittel(page).fill('-20');
    await expect(page.getByText('−20 %', { exact: true })).toBeVisible();
    await expect(page.getByText('Szenario gegenüber Basis')).toBeVisible();
    const diffValue = page
      .getByText('Szenario gegenüber Basis')
      .locator('xpath=..')
      .locator('span')
      .last();
    await expect(diffValue).toHaveText(/^\+/);

    await page.reload();
    await go(page, '#/planung/projektion');
    await expect(lebensmittel(page)).toHaveAttribute('aria-valuetext', '−20\u00a0%');
  });

  test('Einmalausgabe anlegen und wieder löschen', async ({ page }) => {
    await setupSeeded(page);
    await openProjection(page);
    await page.getByRole('button', { name: 'Einmalausgabe oder Ziel' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Ausflug A');
    await dialog.getByLabel('Betrag', { exact: true }).fill('300');
    await dialog.getByLabel('Datum', { exact: true }).fill(addDays(todayIso(), 10));
    await dialog.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Ausflug A', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Ausflug A löschen' }).click();
    await expect(page.getByText('Ausflug A', { exact: true })).toHaveCount(0);
  });

  test('Budgets übernehmen: Budget ab dem Folgemonat mit 400 CAD', async ({ page }) => {
    await setupSeeded(page);
    await openProjection(page);
    await lebensmittel(page).fill('-20');
    await expect(page.getByText('−20 %', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Als Budgets übernehmen' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/→/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Übernehmen', exact: true }).click();
    await expect(page.getByText(/Budgets ab .+ übernommen/)).toBeVisible();

    const next = firstOfNextMonth();
    const budgets = await page.evaluate(async () => {
      const w = window as unknown as {
        __e2e: { db: { budget: { toArray(): Promise<Record<string, unknown>[]> } } };
      };
      return w.__e2e.db.budget.toArray();
    });
    expect(budgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ validFrom: next, monthlyLimitCadMinor: 40000 }),
      ]),
    );
  });

  test('Desktop-Tabelle: sortieren, Zeile bearbeiten, Validierung und Toast', async ({ page }) => {
    await connectE2e(page, 'empty');
    await setupHousehold(page);
    await captureEntry(page, {
      amount: '84,17',
      category: 'Lebensmittel',
      merchant: 'Supermarkt A',
    });
    // Das Erfassungsformular leert sich zusammen mit dem Ausblenden von „Gespeichert“ (900 ms); erst dann erneut erfassen.
    await expect(page.getByText('Gespeichert', { exact: true })).toBeHidden();
    await captureEntry(page, {
      amount: '9,45',
      category: 'Restaurant und Café',
      merchant: 'Café B',
    });
    await go(page, '#/verlauf');

    const amountHead = page.getByRole('columnheader', { name: 'Betrag CAD' });
    const amountButton = page.getByRole('button', { name: 'Betrag CAD', exact: true });
    await amountButton.click();
    await expect(amountHead).toHaveAttribute('aria-sort', 'descending');
    await expect(page.locator('tbody tr').first()).toContainText('Supermarkt A');
    await amountButton.click();
    await expect(amountHead).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator('tbody tr').first()).toContainText('Café B');

    // Tastatur: erste Zeile fokussieren, eine Zeile nach unten, Enter startet die Bearbeitung.
    await page.locator('tbody tr').first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const editRow = page.locator('tbody tr', {
      has: page.getByRole('textbox', { name: 'Betrag CAD' }),
    });
    await expect(editRow.getByRole('textbox', { name: 'Händler / Notiz' })).toHaveValue(
      'Supermarkt A',
    );
    const amountInput = editRow.getByRole('textbox', { name: 'Betrag CAD' });
    await amountInput.fill('abc');
    await amountInput.press('Enter');
    await expect(page.getByText('Bitte einen Betrag größer als 0 eingeben.')).toBeVisible();

    await amountInput.fill('12,50');
    await amountInput.press('Enter');
    await expect(page.getByText('Eintrag geändert')).toBeVisible();
    const savedRow = page.locator('tbody tr', { hasText: 'Supermarkt A' });
    await expect(savedRow).toContainText('12,50');
    await expect(savedRow).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Betrag CAD' })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Betrag CAD' })).toHaveCount(0);
  });

  test('Verlauf: EUR-Eintrag ist beim Bearbeiten als EUR gekennzeichnet', async ({ page }) => {
    await page.route('https://api.frankfurter.dev/**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ date: '2027-01-02', base: 'EUR', quote: 'CAD', rate: 1.5 }),
      }),
    );
    await connectE2e(page, 'empty');
    await setupHousehold(page);
    await captureEntry(page, {
      amount: '10,00',
      category: 'Lebensmittel',
      merchant: 'Supermarkt A',
      currency: 'EUR',
    });
    await go(page, '#/verlauf');
    await page
      .locator('tbody tr', { hasText: 'Supermarkt A' })
      .getByRole('button', { name: 'Bearbeiten' })
      .click();
    const editRow = page.locator('tbody tr', {
      has: page.getByRole('textbox', { name: 'Betrag in EUR' }),
    });
    await expect(editRow.getByText('EUR', { exact: true })).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`axe (${scheme})`, () => {
      test.use({ colorScheme: scheme });

      test('Projektion mit aktivem Szenario ohne Verstöße', async ({ page }) => {
        await setupSeeded(page);
        await openProjection(page);
        await lebensmittel(page).fill('-20');
        await expect(page.getByText('−20 %', { exact: true })).toBeVisible();
        await waitForAnimations(page);
        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
        ).toEqual([]);
      });

      test('Desktop-Verlaufstabelle ohne Verstöße', async ({ page }) => {
        await connectE2e(page, 'empty');
        await setupHousehold(page);
        await captureEntry(page, {
          amount: '84,17',
          category: 'Lebensmittel',
          merchant: 'Supermarkt A',
        });
        await go(page, '#/verlauf');
        await expect(page.getByRole('table')).toBeVisible();
        await waitForAnimations(page);
        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
        ).toEqual([]);
      });
    });
  }
});

test.describe('M4 Teil B Mobil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Projektion auf dem Handy: Szenario-Panel steht unter der Cashflow-Tabelle, ohne Verstöße', async ({
    page,
  }) => {
    await setupSeeded(page);
    await openProjection(page);
    await waitForAnimations(page);
    const tableBox = await page.getByRole('table', { name: 'Cashflow pro Monat' }).boundingBox();
    const panelBox = await page.getByRole('complementary').boundingBox();
    expect(tableBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(panelBox?.y ?? 0).toBeGreaterThan(tableBox?.y ?? Number.POSITIVE_INFINITY);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
    ).toEqual([]);
  });
});
