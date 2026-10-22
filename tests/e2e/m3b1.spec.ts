import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { connectE2e, go, setupHousehold, waitForAnimations, waitForSheetSettled } from './helpers';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const rate = (page: Page) =>
  page.route('https://api.frankfurter.dev/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ date: iso(0), base: 'EUR', quote: 'CAD', rate: 1.5 }),
    }),
  );

async function ready(page: Page) {
  await rate(page);
  await connectE2e(page, 'empty');
  await setupHousehold(page);
}

async function newGoal(
  page: Page,
  name: string,
  target: string,
  startsOn: string,
  targetDate: string,
) {
  await go(page, '#/ziel/neu');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Zielbetrag', { exact: true }).fill(target);
  await page.getByLabel('Start', { exact: true }).fill(startsOn);
  await page.getByLabel('Zieldatum', { exact: true }).fill(targetDate);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function newFixed(page: Page, name: string, amount: string, currency?: 'EUR') {
  await go(page, '#/fixkosten/neu');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Betrag', { exact: true }).fill(amount);
  if (currency) await page.getByRole('button', { name: currency, exact: true }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Planung' })).toBeVisible();
}

test('Sparziel: Vorschlag, Abweichung, erreicht einmal', async ({ page }) => {
  await ready(page);
  await newGoal(page, 'Sparziel A', '1000', iso(-90), iso(90));
  await expect(page.getByText('hinter Plan')).toBeVisible();
  await expect(page.getByText('Etwas zurück')).toBeVisible();
  await page.getByRole('button', { name: /^\+ .*\(Vorschlag\)$/ }).click();
  await expect(page.getByText('Beitrag gespeichert')).toBeVisible();
  await expect(page.getByRole('list').filter({ hasText: '+ ' }).first()).toBeVisible();
  // Rest in einem Beitrag
  await page.getByRole('button', { name: 'Anderer Betrag' }).click();
  await page.getByLabel('Betrag in CAD').fill('2000');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sparziel A ist geschafft!' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Sparziel erreicht', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Abschließen' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Sparziel A' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Beitrag löschen mit Rückgängig', async ({ page }) => {
  await ready(page);
  await newGoal(page, 'Sparziel B', '1000', iso(0), iso(120));
  await page.getByRole('button', { name: 'Anderer Betrag' }).click();
  await page.getByLabel('Betrag in CAD').fill('50');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('+ 50,00')).toBeVisible();
  await page.getByRole('button', { name: /^Beitrag .* vom .* löschen$/ }).click();
  await expect(page.getByText('Noch keine Beiträge.')).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByText('+ 50,00')).toBeVisible();
});

test('Entnahme und Dezimalkomma', async ({ page }) => {
  await ready(page);
  await newGoal(page, 'Sparziel C', '1000', iso(0), iso(120));
  await page.getByRole('button', { name: 'Anderer Betrag' }).click();
  await page.getByLabel('Betrag in CAD').fill('12,5');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('+ 12,50')).toBeVisible();
  await page.getByRole('button', { name: 'Anderer Betrag' }).click();
  await page.getByLabel('Betrag in CAD').fill('-5');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  const withdrawal = page.getByRole('listitem').filter({ hasText: 'Entnahme' });
  await expect(withdrawal).toHaveCount(1);
  await expect(withdrawal).toContainText('5,00');
  await expect(withdrawal).not.toContainText('+ ');
});

test('Archivieren mit Rückgängig, Währung gesperrt', async ({ page }) => {
  await ready(page);
  await newGoal(page, 'Sparziel D', '1000', iso(0), iso(120));
  await page.getByRole('button', { name: 'Anderer Betrag' }).click();
  await page.getByLabel('Betrag in CAD').fill('10');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('+ 10,00')).toBeVisible();
  await page.getByRole('link', { name: 'Bearbeiten' }).click();
  await expect(page.getByRole('button', { name: 'EUR', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Abbrechen' }).click();
  await page.getByRole('button', { name: 'Archivieren' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Planung' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Archiviert' })).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByRole('heading', { name: 'Archiviert' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Sparziel D/ })).toBeVisible();
});

test('Fixkosten CAD und EUR, Einnahme, Bearbeiten, Löschen', async ({ page }) => {
  await ready(page);
  await newFixed(page, 'Streaming-Abo A', '20');
  await newFixed(page, 'Versicherung A', '10', 'EUR');
  await go(page, '#/einnahme/neu');
  await page.getByLabel('Name', { exact: true }).fill('Gehalt A');
  await page.getByLabel('Betrag', { exact: true }).fill('3000');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Planung' })).toBeVisible();
  const fixed = page.getByRole('link', { name: /Versicherung A/ });
  await expect(fixed).toContainText('15,00');
  await expect(fixed).toContainText('10,00');
  await expect(page.getByText('≈ 35,00')).toBeVisible();
  await expect(page.getByRole('link', { name: /Gehalt A/ })).toContainText('+ 3.000,00');
  // Ende setzen und wieder entfernen
  await page.getByRole('link', { name: /Streaming-Abo A/ }).click();
  await page.getByLabel('Ende (optional)').fill(iso(200));
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('link', { name: /Streaming-Abo A/ }).click();
  await expect(page.getByLabel('Ende (optional)')).toHaveValue(iso(200));
  await page.getByRole('button', { name: 'Ende entfernen' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('link', { name: /Streaming-Abo A/ }).click();
  await expect(page.getByLabel('Ende (optional)')).toHaveValue('');
  // Löschen mit Rückgängig
  await page.getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('link', { name: /Streaming-Abo A/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByRole('link', { name: /Streaming-Abo A/ })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe Planung (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test('Planung, Formulare, Detail, Erreicht', async ({ page }) => {
      await ready(page);
      await newFixed(page, 'Streaming-Abo A', '20');
      await go(page, '#/einnahme/neu');
      await page.getByLabel('Name', { exact: true }).fill('Gehalt A');
      await page.getByLabel('Betrag', { exact: true }).fill('3000');
      await page.getByRole('button', { name: 'Speichern' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Planung' })).toBeVisible();
      await newGoal(page, 'Sparziel A', '100', iso(-60), iso(60));
      const axe = async () => {
        await waitForAnimations(page);
        const r = await new AxeBuilder({ page }).analyze();
        expect(
          r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
        ).toEqual([]);
      };
      await axe();
      await go(page, '#/planung');
      await expect(page.getByRole('link', { name: /Sparziel A/ })).toBeVisible();
      await axe();
      for (const [hash, title] of [
        ['#/ziel/neu', 'Neues Ziel'],
        ['#/fixkosten/neu', 'Neue Fixkosten'],
        ['#/einnahme/neu', 'Neue Einnahme'],
      ] as const) {
        await go(page, hash);
        await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
        await axe();
      }
      await go(page, '#/planung');
      await page.getByRole('link', { name: /Sparziel A/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Sparziel A' })).toBeVisible();
      await axe();
      await page.getByRole('button', { name: 'Anderer Betrag' }).click();
      await page.getByLabel('Betrag in CAD').fill('100');
      await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
      const sheet = page.getByRole('dialog', { name: 'Sparziel A ist geschafft!' });
      await expect(sheet).toBeVisible();
      await waitForSheetSettled(sheet);
      await expect(sheet.getByRole('button', { name: 'Abschließen' })).toBeEnabled();
      await axe();
    });
  });
}
