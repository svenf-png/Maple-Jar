import AxeBuilder from '@axe-core/playwright';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type Route,
  test,
} from '@playwright/test';
import { todayIso } from '../../src/data/today';
import { addDays } from '../../src/domain/schedule';
import { createSharedServer } from './fake-supabase-route';
import { PERSON_A, PROJECT_URL } from './fixtures/household';
import {
  captureEntry,
  connectE2e,
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

test('Offline mit wartendem Eintrag, Wartet auf Sync, Rückkehr online', async ({ browser }) => {
  const { context, page, server } = await startDevice(browser);
  // Erfassen vorab laden, damit die Seite offline verfügbar ist
  await go(page, '#/erfassen');
  await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
  await go(page, '#/');
  await expect(overviewHeading(page)).toBeVisible();
  await context.setOffline(true);

  await captureEntry(page, { amount: '12,50', category: 'Lebensmittel', merchant: 'Café B' });
  await expect(page.getByText('Auf dem Gerät gespeichert')).toBeVisible();

  await go(page, '#/');
  const pill = page.getByText('Offline · 1 warten auf Sync', { exact: true });
  await expect(pill).toBeVisible();
  expect(await pill.locator('svg').count()).toBeGreaterThanOrEqual(1);
  const row = page.getByRole('link', { name: /Café B/ });
  await expect(row.getByText('Wartet auf Sync', { exact: true })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Synchronisiert' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Wartet auf Sync', { exact: true })).toHaveCount(0);
  await expect
    .poll(() => server.events.some((e) => e.entity === 'entry'), { timeout: 20_000 })
    .toBe(true);
});

test('Sync gestört zeigt Erneut versuchen und stellt den Sync wieder her', async ({ browser }) => {
  const { context, page } = await startDevice(browser);
  const handler = (r: Route) =>
    r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  await context.route(`${PROJECT_URL}/rest/v1/**`, handler);
  await page.reload();
  const retry = page.getByRole('button', { name: 'Sync gestört · Erneut versuchen' });
  await expect(retry).toBeVisible({ timeout: 20_000 });

  await context.unroute(`${PROJECT_URL}/rest/v1/**`, handler);
  await retry.click();
  await expect(page.getByRole('button', { name: 'Synchronisiert' })).toBeVisible({
    timeout: 20_000,
  });
});

test('Sitzung abgelaufen: Anmeldung erneuern, dann Sync wieder verbunden', async ({ browser }) => {
  const { page, server } = await startDevice(browser);
  server.revokeSessions();
  await captureEntry(page, { amount: '7,00', category: 'Lebensmittel', merchant: 'Supermarkt A' });

  await go(page, '#/');
  const link = page.getByRole('link', { name: 'Anmeldung erneuern' });
  await expect(link).toBeVisible({ timeout: 20_000 });
  await link.click();
  await expect(page).toHaveURL(/#\/anmelden$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Anmeldung erneuern' })).toBeVisible();
  const username = page.getByLabel('Benutzername');
  await expect(username).toHaveAttribute('readonly', '');
  await expect(username).toHaveValue(PERSON_A.username);

  await page.getByLabel('Passwort').fill('falsch-1');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Benutzername oder Passwort stimmt nicht, oder die Anmeldung ist abgelaufen.',
  );

  await page.getByLabel('Passwort').fill(PERSON_A.password);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('button', { name: 'Synchronisiert' })).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(() => server.events.some((e) => e.entity === 'entry'), { timeout: 20_000 })
    .toBe(true);
});

test.describe('Desktop-Pille in der Seitenleiste', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('zeigt Synchronisiert und danach Offline', async ({ browser }) => {
    const { page } = await startDevice(browser, { viewport: { width: 1280, height: 900 } });
    const side = page.getByRole('complementary');
    await expect(side.getByRole('button', { name: 'Synchronisiert' })).toBeVisible({
      timeout: 20_000,
    });

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(side.getByText('Offline', { exact: true })).toBeVisible();
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Zustände Barrierefreiheit (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('Offline mit wartendem Eintrag: axe ohne Verstöße', async ({ browser }) => {
      const { context, page } = await startDevice(browser, { colorScheme: scheme });
      await go(page, '#/erfassen');
      await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
      await go(page, '#/');
      await context.setOffline(true);
      await captureEntry(page, { amount: '12,50', category: 'Lebensmittel', merchant: 'Café B' });
      await go(page, '#/');
      await expect(page.getByText('Offline · 1 warten auf Sync', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: /Café B/ })).toBeVisible();
      await waitForAnimations(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
      ).toEqual([]);
    });

    test('Sync gestört: axe ohne Verstöße', async ({ browser }) => {
      const { context, page } = await startDevice(browser, { colorScheme: scheme });
      const handler = (r: Route) =>
        r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      await context.route(`${PROJECT_URL}/rest/v1/**`, handler);
      await page.reload();
      await expect(
        page.getByRole('button', { name: 'Sync gestört · Erneut versuchen' }),
      ).toBeVisible({ timeout: 20_000 });
      await waitForAnimations(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
      ).toEqual([]);
      await context.unroute(`${PROJECT_URL}/rest/v1/**`, handler);
    });

    test('Anmeldung erneuern: axe ohne Verstöße', async ({ browser }) => {
      const { server, page } = await startDevice(browser, { colorScheme: scheme });
      server.revokeSessions();
      await captureEntry(page, {
        amount: '7,00',
        category: 'Lebensmittel',
        merchant: 'Supermarkt A',
      });
      await go(page, '#/anmelden');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Anmeldung erneuern' }),
      ).toBeVisible();
      await waitForAnimations(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
      ).toEqual([]);
    });
  });
}

const axeViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
};

/** Frischer Haushalt ohne Einträge, Kategorien aus der Vorlage angelegt, auf der Übersicht. */
async function readyEmpty(page: Page) {
  await connectE2e(page, 'empty');
  await setupHousehold(page);
  await go(page, '#/kategorien');
  await expect(page.getByText('Lebensmittel', { exact: true })).toBeVisible();
  await go(page, '#/');
  await expect(overviewHeading(page)).toBeVisible();
}

/** Legt ein Sparziel über die App-Aktion an (Testmodus). */
async function seedGoal(page: Page) {
  await page.evaluate(
    async ({ startsOn, targetDate }) => {
      const w = window as unknown as {
        __e2e: {
          db: unknown;
          actions: { createGoal(db: unknown, input: Record<string, unknown>): Promise<string> };
        };
      };
      const { db, actions } = w.__e2e;
      await actions.createGoal(db, {
        name: 'Sparziel A',
        icon: 'sonstiges',
        color: '#2C6CB0',
        targetMinor: 10000,
        currency: 'CAD',
        startsOn,
        targetDate,
      });
    },
    { startsOn: addDays(todayIso(), -90), targetDate: addDays(todayIso(), 90) },
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Übersicht-Zustände (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('Leere Übersicht: Willkommen, Coach-Mark, axe ohne Verstöße', async ({ page }) => {
      await readyEmpty(page);
      await expect(page.getByRole('heading', { level: 2, name: 'Willkommen!' })).toBeVisible();
      await expect(
        page.getByRole('note').filter({ hasText: 'Hier tippen, um eine Ausgabe zu erfassen' }),
      ).toBeVisible();
      await expect(page.getByText('Noch keine Einträge', { exact: true })).toBeVisible();
      await waitForAnimations(page);
      expect(await axeViolations(page)).toEqual([]);
    });

    test('Budget ab 80 % und überschritten: Zustände und axe', async ({ page }) => {
      await readyEmpty(page);
      await go(page, '#/budgets');
      await page.getByRole('button', { name: 'Limit festlegen: Lebensmittel' }).click();
      await page.getByLabel('Monatslimit in CAD').fill('100');
      await page.getByRole('button', { name: 'Speichern' }).click();
      await captureEntry(page, { amount: '85', category: 'Lebensmittel' });
      await go(page, '#/');
      const near = page.getByText('Fast aufgebraucht', { exact: true });
      await expect(near).toBeVisible();
      expect(await near.evaluate((el) => el.querySelector('svg') !== null)).toBe(true);
      await expect(page.getByText('85 % erreicht')).toBeVisible();
      await waitForAnimations(page);
      expect(await axeViolations(page)).toEqual([]);

      await captureEntry(page, { amount: '20', category: 'Lebensmittel' });
      await go(page, '#/');
      await expect(page.getByText('Über Budget', { exact: true })).toBeVisible();
      await expect(page.getByText(/Budget um .* überschritten/)).toBeVisible();
      await waitForAnimations(page);
      expect(await axeViolations(page)).toEqual([]);
    });

    test('Sparziel erreicht: Dialog, axe, einmal pro Ziel', async ({ page }) => {
      await readyEmpty(page);
      await seedGoal(page);
      await go(page, '#/');
      await page.getByRole('link', { name: /Sparziel A/ }).click();
      await expect(page).toHaveURL(/#\/ziel\/[0-9a-f-]+$/);
      await page.getByRole('button', { name: 'Anderer Betrag' }).click();
      await page.getByLabel('Betrag in CAD').fill('100');
      await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();

      const dialog = page.getByRole('dialog', { name: 'Sparziel A ist geschafft!' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Sparziel erreicht', { exact: true })).toBeVisible();
      await waitForAnimations(page);
      expect(await axeViolations(page)).toEqual([]);

      await dialog.getByRole('button', { name: 'Abschließen' }).click();
      await expect(dialog).toBeHidden();
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Sparziel A' })).toBeVisible();
      // Beitrag geladen: das Ziel gilt wieder als erreicht, der Effekt liest jetzt den Merker.
      await expect(page.getByText('100 % geschafft')).toBeVisible();
      // Dexie führt Lesezugriffe auf `meta` der Reihe nach aus: Sobald diese Abfrage antwortet und
      // zwei Frames gezeichnet sind, ist die Merker-Abfrage der Seite beantwortet und verarbeitet.
      const seen = await page.evaluate(async () => {
        const w = window as unknown as {
          __e2e: { db: { meta: { toArray(): Promise<{ key: string; value: unknown }[]> } } };
        };
        const rows = await w.__e2e.db.meta.toArray();
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        return rows.filter((m) => m.key.startsWith('goalReachedSeen:')).map((m) => m.value);
      });
      expect(seen).toEqual([true]);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  });
}

test.describe('Leere Übersicht am Desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('zeigt keinen Coach-Mark', async ({ page }) => {
    await readyEmpty(page);
    await expect(page.getByRole('heading', { level: 2, name: 'Willkommen!' })).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
  });
});
