import { expect, type Page, test } from '@playwright/test';
import { todayIso } from '../../src/data/today';
import { createSharedServer } from './fake-supabase-route';
import { PERSON_A, PERSON_B } from './fixtures/household';
import { fillConnect, go, overviewHeading, setupHousehold } from './helpers';

// Zwei Geräte = zwei Browser-Kontexte gegen denselben Server. Fixkosten-Testdaten über `window.__e2e`
// (src/data/e2e-seed.ts, nur im E2E-Build).
test.use({ serviceWorkers: 'block' });

const today = todayIso();

async function newDevice(
  browser: import('@playwright/test').Browser,
  install: (c: import('@playwright/test').BrowserContext) => Promise<void>,
) {
  const context = await browser.newContext({
    locale: 'de-DE',
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 },
  });
  await install(context);
  const page = await context.newPage();
  return { context, page };
}

async function seedFixed(page: Page, autobook: boolean) {
  await page.evaluate(
    async ({ today, autobook }) => {
      const w = window as unknown as {
        __e2e: {
          db: { category: { toArray(): Promise<Array<{ id: string }>> } };
          actions: { createFixedCost(db: unknown, input: unknown): Promise<string> };
        };
      };
      const { db, actions } = w.__e2e;
      const categoryId = (await db.category.toArray())[0]?.id;
      await actions.createFixedCost(db, {
        name: 'Streaming-Abo A',
        amountMinor: 1500,
        currency: 'CAD',
        categoryId,
        isSaving: false,
        autobook,
        unit: 'month',
        every: 1,
        startsOn: today,
      });
    },
    { today, autobook },
  );
}

const entryCount = (page: Page) =>
  page.evaluate(async () => {
    const w = window as unknown as { __e2e: { db: { entry: { count(): Promise<number> } } } };
    return w.__e2e.db.entry.count();
  });

/** Neu laden = Sync beim App-Start. */
async function resync(page: Page, hash: string) {
  await page.reload();
  await go(page, hash);
}

async function createHousehold(a: Page) {
  await a.goto('/#/verbinden');
  await fillConnect(a, PERSON_A);
  await setupHousehold(a, 'Person A');
  await expect(overviewHeading(a)).toBeVisible();
}

test('zwei Geräte: dieselbe Fixkosten-Fälligkeit auf beiden Geräten gebucht ergibt einen Eintrag', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { server, install } = createSharedServer();
  const a = await newDevice(browser, install);
  const b = await newDevice(browser, install);

  await createHousehold(a.page);
  await seedFixed(a.page, false);
  await expect
    .poll(() => server.events.some((e) => e.entity === 'fixedCost'), { timeout: 20_000 })
    .toBe(true);

  await b.page.goto('/#/verbinden');
  await fillConnect(b.page, PERSON_B);
  await expect(b.page).toHaveURL(/#\/beitreten/);
  await b.page.getByLabel('Dein Anzeigename').fill('Person B');
  await b.page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(overviewHeading(b.page)).toBeVisible();
  await expect.poll(() => server.members.length).toBe(2);
  await resync(b.page, '#/');
  const due = (p: Page) => p.getByRole('button', { name: /Streaming-Abo A/ });
  await expect(due(b.page)).toBeVisible({ timeout: 20_000 });
  await expect(due(a.page)).toBeVisible();

  // Beide offline buchen dieselbe Fälligkeit.
  await a.context.setOffline(true);
  await b.context.setOffline(true);
  for (const d of [a, b]) {
    await due(d.page).click();
    await d.page.getByRole('dialog').getByRole('button', { name: 'Als bezahlt buchen' }).click();
    await expect(d.page.getByText('Streaming-Abo A gebucht')).toBeVisible();
  }
  await a.context.setOffline(false);
  await b.context.setOffline(false);
  await resync(a.page, '#/verlauf');
  await resync(b.page, '#/verlauf');
  await resync(a.page, '#/verlauf');
  await resync(b.page, '#/verlauf');

  for (const d of [a, b]) {
    await expect(d.page.getByRole('link').filter({ hasText: 'Fixkosten' })).toHaveCount(1, {
      timeout: 20_000,
    });
    expect(await entryCount(d.page)).toBe(1);
  }
});

test('Autobook bucht beim Start nach dem ersten Sync und nicht doppelt nach Neuladen', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { server, install } = createSharedServer();
  const a = await newDevice(browser, install);
  await createHousehold(a.page);
  await seedFixed(a.page, true);

  await resync(a.page, '#/verlauf');
  await expect(a.page.getByRole('link').filter({ hasText: 'Fixkosten' })).toHaveCount(1, {
    timeout: 20_000,
  });
  const created = () => server.events.filter((e) => e.entity === 'entry').length;
  await expect.poll(created, { timeout: 20_000 }).toBeGreaterThan(0);
  const before = created();

  await resync(a.page, '#/verlauf');
  await a.page.waitForTimeout(3000);
  await expect(a.page.getByRole('link').filter({ hasText: 'Fixkosten' })).toHaveCount(1);
  expect(await entryCount(a.page)).toBe(1);
  expect(created()).toBe(before);
});
