import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createSharedServer } from './fake-supabase-route';
import { PERSON_A, PERSON_B } from './fixtures/household';
import { fillConnect, go, overviewHeading, seedLastMonthEntry, setupHousehold } from './helpers';

// Zwei Geräte = zwei Browser-Kontexte gegen denselben Server. Neu laden = Sync beim App-Start.
test.use({ serviceWorkers: 'block' });

async function newDevice(browser: Browser, install: (c: BrowserContext) => Promise<void>) {
  const context = await browser.newContext({
    locale: 'de-DE',
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 },
  });
  await install(context);
  const page = await context.newPage();
  return { context, page };
}

async function resync(page: Page, hash: string) {
  await page.reload();
  await go(page, hash);
}

const lebensmittel = (page: Page) => page.getByRole('slider', { name: /Lebensmittel/ });

test('zwei Geräte: Regler-Werte werden synchron, letzter Schreibvorgang gewinnt ohne Konflikt', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { server, install } = createSharedServer();
  const a = await newDevice(browser, install);
  const b = await newDevice(browser, install);

  await a.page.goto('/#/verbinden');
  await fillConnect(a.page, PERSON_A);
  await setupHousehold(a.page, 'Person A');
  await expect(overviewHeading(a.page)).toBeVisible();
  await seedLastMonthEntry(a.page, '500,00', 'Supermarkt A');
  await expect
    .poll(() => server.events.some((e) => e.entity === 'entry'), { timeout: 20_000 })
    .toBe(true);

  await b.page.goto('/#/verbinden');
  await fillConnect(b.page, PERSON_B);
  await expect(b.page).toHaveURL(/#\/beitreten/);
  await b.page.getByLabel('Dein Anzeigename').fill('Person B');
  await b.page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(overviewHeading(b.page)).toBeVisible();
  await expect.poll(() => server.members.length).toBe(2);

  // A setzt Lebensmittel auf −20 %, B lädt neu und sieht den Wert.
  await go(a.page, '#/planung/projektion');
  await expect(lebensmittel(a.page)).toBeVisible({ timeout: 20_000 });
  const beforeA = server.events.length;
  await lebensmittel(a.page).fill('-20');
  await expect.poll(() => server.events.length, { timeout: 20_000 }).toBeGreaterThan(beforeA);
  await resync(b.page, '#/planung/projektion');
  await expect(lebensmittel(b.page)).toHaveAttribute('aria-valuetext', '−20\u00a0%', {
    timeout: 20_000,
  });

  // B setzt auf +10 %, A lädt neu und sieht den Wert.
  const beforeB = server.events.length;
  await lebensmittel(b.page).fill('10');
  await expect.poll(() => server.events.length, { timeout: 20_000 }).toBeGreaterThan(beforeB);
  await resync(a.page, '#/planung/projektion');
  await expect(lebensmittel(a.page)).toHaveAttribute('aria-valuetext', '+10\u00a0%', {
    timeout: 20_000,
  });

  // Kein Konfliktdialog und kein Konflikt in der Datenbank.
  for (const d of [a, b]) {
    await expect(d.page.getByRole('dialog')).toHaveCount(0);
    const conflicts = await d.page.evaluate(async () => {
      const w = window as unknown as { __e2e: { db: { conflicts: { count(): Promise<number> } } } };
      return w.__e2e.db.conflicts.count();
    });
    expect(conflicts).toBe(0);
  }

  await a.context.close();
  await b.context.close();
});
