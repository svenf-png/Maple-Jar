import AxeBuilder from '@axe-core/playwright';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createSharedServer } from './fake-supabase-route';
import { PERSON_A, PERSON_B } from './fixtures/household';
import {
  captureEntry,
  fillConnect,
  go,
  overviewHeading,
  settleForAxe,
  setupHousehold,
} from './helpers';

test.use({ serviceWorkers: 'block' });

const VIEWPORT = { width: 1280, height: 900 };

async function newDevice(
  browser: Browser,
  install: (c: BrowserContext) => Promise<void>,
  colorScheme: 'light' | 'dark',
) {
  const context = await browser.newContext({
    locale: 'de-DE',
    serviceWorkers: 'block',
    viewport: VIEWPORT,
    colorScheme,
  });
  await install(context);
  return { context, page: await context.newPage() };
}

/** Neu laden = Sync beim App-Start. */
async function resync(page: Page, hash: string) {
  await page.reload();
  await go(page, hash);
}

/** Zwei Geräte mit einem gemeinsamen Eintrag „Supermarkt A“, beide offline und auf der Detailseite. */
async function twoDevices(browser: Browser, colorScheme: 'light' | 'dark' = 'light') {
  const { server, install } = createSharedServer();
  const a = await newDevice(browser, install, colorScheme);
  const b = await newDevice(browser, install, colorScheme);
  await a.page.goto('/#/verbinden');
  await fillConnect(a.page, PERSON_A);
  await setupHousehold(a.page, 'Person A');
  await expect(overviewHeading(a.page)).toBeVisible();
  await captureEntry(a.page, {
    amount: '84,17',
    category: 'Lebensmittel',
    merchant: 'Supermarkt A',
  });
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
  await resync(b.page, '#/verlauf');
  for (const d of [a, b]) {
    await go(d.page, '#/verlauf');
    await d.page.getByRole('button', { name: 'Einträge' }).click();
    await d.page.getByRole('link', { name: /Supermarkt A/ }).click();
    await expect(d.page.getByText('Änderungshistorie')).toBeVisible();
    // Bearbeiten-Seite vorab laden (offline liefert sie sonst nichts)
    await d.page.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(d.page.getByRole('heading', { name: 'Ausgabe bearbeiten' })).toBeVisible();
    await d.page.goBack();
    await expect(d.page.getByText('Änderungshistorie')).toBeVisible();
  }
  const detailUrl = a.page.url().split('#')[1] ?? '';
  await a.context.setOffline(true);
  await b.context.setOffline(true);
  return { a, b, server, detailUrl: `#${detailUrl}` };
}

const editAmount = async (page: Page, digits: string) => {
  await page.getByRole('link', { name: 'Bearbeiten' }).click();
  for (let i = 0; i < 8; i++)
    await page.getByRole('button', { name: 'Letzte Ziffer löschen' }).click();
  for (const ch of digits) await page.getByRole('button', { name: ch, exact: true }).click();
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Änderungshistorie')).toBeVisible();
};

type Devices = Awaited<ReturnType<typeof twoDevices>>;

/** Wartet, bis A seine Auflösung (`count` Ereignisse) zum Server geschoben hat (Scheduler: nach 2 s). */
const pushed = (d: Devices, before: number, count: number) =>
  expect
    .poll(() => d.server.events.length - before, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(count);

/** Beide Geräte online, Sync, A zeigt den Konflikt auf der Detailseite. */
async function syncBoth({ a, b, detailUrl }: Devices) {
  await a.context.setOffline(false);
  await b.context.setOffline(false);
  await resync(a.page, detailUrl);
  await resync(b.page, detailUrl);
  await resync(a.page, detailUrl);
}

test('Feldkonflikt: A wählt die Version von Person B, B sieht sie ohne Konflikt', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const d = await twoDevices(browser);
  const { a, b } = d;
  await editAmount(a.page, '90');
  await editAmount(b.page, '95');
  await syncBoth(d);

  await expect(a.page.getByRole('button', { name: 'Konflikt lösen' })).toBeVisible({
    timeout: 20_000,
  });
  await a.page.getByRole('button', { name: 'Konflikt lösen' }).click();
  const dialog = a.page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Zwei Versionen gefunden' })).toBeVisible();
  await expect(dialog.getByText('Deine Version')).toBeVisible();
  await expect(dialog.getByText('Version von Person B')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Diese Version behalten' })).toBeDisabled();
  await dialog.getByRole('radio', { name: /Version von Person B/ }).check();
  const before = d.server.events.length;
  await dialog.getByRole('button', { name: 'Diese Version behalten' }).click();
  await expect(a.page.getByText('Konflikt gelöst')).toBeVisible();
  await pushed(d, before, 1);
  await expect(a.page.getByRole('button', { name: 'Konflikt lösen' })).toHaveCount(0);
  await expect(a.page.getByText('95,00 CA$', { exact: true })).toBeVisible();

  // B holt die Auflösung beim nächsten Pull
  await resync(b.page, d.detailUrl);
  await expect(b.page.getByText('95,00 CA$', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(b.page.getByRole('button', { name: 'Konflikt lösen' })).toHaveCount(0);
  await go(b.page, '#/verlauf');
  await expect(b.page.getByRole('link', { name: /Supermarkt A/ })).not.toContainText('Konflikt');
  await a.context.close();
  await b.context.close();
});

test('Beide behalten ergibt zwei Einträge', async ({ browser }) => {
  test.setTimeout(180_000);
  const d = await twoDevices(browser);
  const { a, b } = d;
  await editAmount(a.page, '90');
  await editAmount(b.page, '95');
  await syncBoth(d);

  await a.page.getByRole('button', { name: 'Konflikt lösen' }).click();
  const dialog = a.page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /Deine Version/ }).check();
  const before = d.server.events.length;
  await dialog.getByRole('button', { name: 'Beide als eigene Einträge behalten' }).click();
  await expect(a.page.getByText('Konflikt gelöst')).toBeVisible();
  await pushed(d, before, 2);
  await go(a.page, '#/verlauf');
  await a.page.getByRole('button', { name: 'Einträge' }).click();
  await expect(a.page.getByRole('link', { name: /Supermarkt A/ })).toHaveCount(2);

  await resync(b.page, '#/verlauf');
  await b.page.getByRole('button', { name: 'Einträge' }).click();
  await expect(b.page.getByRole('link', { name: /Supermarkt A/ })).toHaveCount(2, {
    timeout: 20_000,
  });
  await expect(b.page.getByRole('link', { name: /Supermarkt A/ }).first()).not.toContainText(
    'Konflikt',
  );
  await a.context.close();
  await b.context.close();
});

test('Löschen gegen Bearbeiten: A stellt wieder her', async ({ browser }) => {
  test.setTimeout(180_000);
  const d = await twoDevices(browser);
  const { a, b } = d;
  await a.page.getByRole('button', { name: 'Eintrag löschen' }).click();
  await expect(a.page).toHaveURL(/#\/verlauf/);
  await editAmount(b.page, '95');
  await a.context.setOffline(false);
  await b.context.setOffline(false);
  await resync(a.page, d.detailUrl);
  await resync(b.page, d.detailUrl);
  await resync(a.page, d.detailUrl);

  await expect(a.page.getByRole('button', { name: 'Konflikt lösen' })).toBeVisible({
    timeout: 20_000,
  });
  await a.page.getByRole('button', { name: 'Konflikt lösen' }).click();
  const dialog = a.page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Wiederherstellen oder gelöscht lassen?' }),
  ).toBeVisible();
  const before = d.server.events.length;
  await dialog.getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(a.page.getByText('Konflikt gelöst')).toBeVisible();
  await pushed(d, before, 1);
  await expect(a.page.getByRole('button', { name: 'Konflikt lösen' })).toHaveCount(0);
  await expect(a.page.getByText('Dieser Eintrag ist gelöscht.')).toHaveCount(0);

  await resync(b.page, d.detailUrl);
  await expect(b.page.getByText('95,00 CA$', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(b.page.getByText('Dieser Eintrag ist gelöscht.')).toHaveCount(0);
  await expect(b.page.getByRole('button', { name: 'Konflikt lösen' })).toHaveCount(0);
  await a.context.close();
  await b.context.close();
});

// axe misst Kontraste sonst mitten in der Einblend-Animation des Sheets (vor allem in WebKit).
async function animationsDone(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe Konflikt-Dialog (${scheme})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const d = await twoDevices(browser, scheme);
    await editAmount(d.a.page, '90');
    await editAmount(d.b.page, '95');
    await syncBoth(d);
    await d.a.page.getByRole('button', { name: 'Konflikt lösen' }).click();
    const dialog = d.a.page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Zwei Versionen gefunden' })).toBeVisible();
    await dialog.getByRole('radio', { name: /Version von Person B/ }).check();
    await animationsDone(d.a.page);
    await settleForAxe(d.a.page);
    const results = await new AxeBuilder({ page: d.a.page }).analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
    ).toEqual([]);
    await d.a.context.close();
    await d.b.context.close();
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe Konflikt-Dialog Löschen gegen Bearbeiten (${scheme})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const d = await twoDevices(browser, scheme);
    await d.a.page.getByRole('button', { name: 'Eintrag löschen' }).click();
    await expect(d.a.page).toHaveURL(/#\/verlauf/);
    await editAmount(d.b.page, '95');
    await d.a.context.setOffline(false);
    await d.b.context.setOffline(false);
    await resync(d.a.page, d.detailUrl);
    await resync(d.b.page, d.detailUrl);
    await resync(d.a.page, d.detailUrl);
    await d.a.page.getByRole('button', { name: 'Konflikt lösen' }).click();
    const dialog = d.a.page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Wiederherstellen oder gelöscht lassen?' }),
    ).toBeVisible();
    await expect(dialog.getByText('Geänderte Werte')).toBeVisible();
    await expect(dialog.getByText(/95,00/)).toBeVisible();
    await animationsDone(d.a.page);
    await settleForAxe(d.a.page);
    const results = await new AxeBuilder({ page: d.a.page }).analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
    ).toEqual([]);
    await d.a.context.close();
    await d.b.context.close();
  });
}
