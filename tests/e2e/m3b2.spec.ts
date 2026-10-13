import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { todayIso } from '../../src/data/today';
import { addDays } from '../../src/domain/schedule';
import { connectE2e, go, setupHousehold } from './helpers';

// Testdaten (Einnahmen, Fixkosten, Sparziele) entstehen über `window.__e2e` (src/data/e2e-seed.ts, nur im E2E-Build),
// solange die Formulare nicht Teil dieses Zweigs sind. Alles fiktiv.

const today = todayIso();
const monthStart = `${today.slice(0, 7)}-01`;

/** Legt eine Zeile über die App-Aktionen an. */
async function seed(page: Page, kind: string, data: Record<string, unknown>): Promise<string> {
  return page.evaluate(
    async ({ kind, data }) => {
      const w = window as unknown as {
        __e2e: {
          db: { category: { toArray(): Promise<Array<{ id: string; name: string }>> } };
          actions: Record<string, (...args: unknown[]) => Promise<string>>;
        };
      };
      const { db, actions } = w.__e2e;
      const cats = await db.category.toArray();
      const cat = cats.find((c) => c.name === 'Lebensmittel') ?? cats[0];
      const categoryId = cat?.id;
      if (kind === 'budget')
        return String(await actions.setBudget?.(db, categoryId, data.month, data.limit));
      const fn = { income: 'createIncome', fixed: 'createFixedCost', goal: 'createGoal' }[kind];
      const input = kind === 'fixed' ? { categoryId, ...data } : data;
      return fn ? ((await actions[fn]?.(db, input)) ?? '') : '';
    },
    { kind, data },
  );
}

const income = (page: Page, amountMinor: number, name = 'Einnahme A') =>
  seed(page, 'income', {
    name,
    amountMinor,
    currency: 'CAD',
    unit: 'month',
    every: 1,
    startsOn: monthStart,
  });

const fixed = (page: Page, amountMinor: number, extra: Record<string, unknown> = {}) =>
  seed(page, 'fixed', {
    name: 'Streaming-Abo A',
    amountMinor,
    currency: 'CAD',
    isSaving: false,
    autobook: false,
    unit: 'month',
    every: 1,
    startsOn: today,
    ...extra,
  });

async function start(page: Page) {
  await connectE2e(page, 'empty');
  await setupHousehold(page);
}

const legend = (page: Page) => page.getByRole('list').filter({ has: page.locator('[data-kind]') });

test('Fixkosten: fällig, per Tipp buchen, Verlauf mit Kennzeichnung, Budget steigt, Rückgängig', async ({
  page,
}) => {
  await start(page);
  await seed(page, 'budget', { month: today, limit: 10000 });
  await fixed(page, 1500);

  await expect(page.getByRole('heading', { name: 'Als Nächstes fällig' })).toBeVisible();
  const row = page.getByRole('button', { name: /Streaming-Abo A/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Heute');
  await row.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Als bezahlt buchen' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Als bezahlt buchen' }).click();
  await expect(page.getByText('Streaming-Abo A gebucht')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Als Nächstes fällig' })).toHaveCount(0);
  await expect(page.getByText(/15,00.*von.*100,00/)).toBeVisible();

  await go(page, '#/verlauf');
  const entry = page.getByRole('link').filter({ hasText: 'Fixkosten' });
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('15,00');
});

test('Fixkosten: Rückgängig nach dem Buchen stellt die Fälligkeit wieder her', async ({ page }) => {
  await start(page);
  await fixed(page, 1500);
  await page.getByRole('button', { name: /Streaming-Abo A/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Als bezahlt buchen' }).click();
  await expect(page.getByRole('heading', { name: 'Als Nächstes fällig' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByRole('button', { name: /Streaming-Abo A/ })).toBeVisible();
  await go(page, '#/verlauf');
  await expect(page.getByRole('link').filter({ hasText: 'Fixkosten' })).toHaveCount(0);
  // Erneut buchen stellt den gelöschten Eintrag wieder her (kein zweiter Eintrag).
  await go(page, '#/');
  await page.getByRole('button', { name: /Streaming-Abo A/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Als bezahlt buchen' }).click();
  await expect(page.getByText('Streaming-Abo A wieder gebucht')).toBeVisible();
  await go(page, '#/verlauf');
  await expect(page.getByRole('link').filter({ hasText: 'Fixkosten' })).toHaveCount(1);
});

test('Fixkosten: überfällig ist markiert (Amber, Icon, Text)', async ({ page }) => {
  await start(page);
  await fixed(page, 2000, { startsOn: addDays(today, -3), unit: 'week', every: 4 });
  const row = page.getByRole('button', { name: /Streaming-Abo A/ });
  await expect(row).toContainText('Überfällig');
  await expect(row.locator('svg')).toHaveCount(2); // Kategorie-Symbol und Warnzeichen
});

test('Sparziele: Karte mit Fortschritt und Status, Link zum Detail', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('heading', { name: 'Sparziele' })).toHaveCount(0);
  await seed(page, 'goal', {
    name: 'Sparziel A',
    icon: 'sonstiges',
    color: '#2C6CB0',
    targetMinor: 120000,
    currency: 'CAD',
    startsOn: addDays(today, -90),
    targetDate: addDays(today, 90),
  });
  const card = page.getByRole('link', { name: /Sparziel A/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText('0 % von');
  await expect(card).toContainText('Etwas zurück');
  await expect(card.locator('svg')).toHaveCount(2); // Symbol und Warnzeichen
  await card.click();
  await expect(page).toHaveURL(/#\/ziel\/[0-9a-f-]+$/);
});

test('Donut: Einnahme ändert Segmente und Legende, Sonderfälle', async ({ page }) => {
  await start(page);
  // keine Einnahmen, aber Ausgaben: Hinweis statt Anteil
  await fixed(page, 40000);
  await expect(page.getByText('Noch keine Einnahmen erfasst')).toBeVisible();
  await expect(page.getByRole('img', { name: /Noch keine Einnahmen/ })).toBeVisible();
  await expect(page.locator('[data-kind="free"]')).toHaveCount(0);

  // normaler Fall
  await income(page, 200000);
  const donut = page.getByRole('img', { name: /Anteil am Einkommen von/ });
  await expect(donut).toBeVisible();
  await expect(page.locator('[data-kind="free"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="fixed"]')).toContainText('20 %');
  const before = await legend(page).innerText();

  await income(page, 200000, 'Einnahme B');
  await expect(page.locator('[data-kind="fixed"]')).toContainText('10 %');
  expect(await legend(page).innerText()).not.toBe(before);

  // Überlauf: Ausgaben über den Einnahmen, Amber mit Icon und Text
  await fixed(page, 900000, { name: 'Streaming-Abo B' });
  const over = page.locator('[data-kind="overflow"]');
  await expect(over).toContainText('Über den Einnahmen');
  await expect(over.locator('svg')).toHaveCount(1);
  await expect(page.getByRole('img', { name: /über den Einnahmen/ })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Übersicht axe (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('Donut, Fälligkeiten, Sparziele und Buchen-Sheet ohne Verstöße', async ({ page }) => {
      await start(page);
      await seed(page, 'budget', { month: today, limit: 50000 });
      await income(page, 400000);
      await fixed(page, 1500);
      await fixed(page, 2000, {
        name: 'Streaming-Abo B',
        startsOn: addDays(today, -2),
        unit: 'week',
        every: 4,
      });
      await seed(page, 'goal', {
        name: 'Sparziel A',
        icon: 'sonstiges',
        color: '#2C6CB0',
        targetMinor: 120000,
        currency: 'CAD',
        startsOn: addDays(today, -90),
        targetDate: addDays(today, 90),
      });
      await expect(page.getByRole('img', { name: /Anteil am Einkommen von/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Streaming-Abo B/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /Sparziel A/ })).toBeVisible();
      const scan = async () => {
        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
        ).toEqual([]);
      };
      await scan();
      await page.getByRole('button', { name: /Streaming-Abo B/ }).click();
      await page.waitForTimeout(500); // Einblend-Animation des Blatts abwarten (axe misst sonst Zwischenfarben)
      await expect(
        page.getByRole('dialog').getByRole('button', { name: 'Als bezahlt buchen' }),
      ).toBeVisible();
      await scan();
    });
  });
}
