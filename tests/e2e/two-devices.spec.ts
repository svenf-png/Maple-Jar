import { expect, type Page, test } from '@playwright/test';
import { createSharedServer } from './fake-supabase-route';
import { PERSON_A, PERSON_B } from './fixtures/household';
import { captureEntry, fillConnect, go, overviewHeading, setupHousehold } from './helpers';

// Zwei Geräte = zwei Browser-Kontexte mit eigenem Speicher, beide gegen denselben Server.
test.use({ serviceWorkers: 'block' });

async function newDevice(
  browser: import('@playwright/test').Browser,
  install: (c: import('@playwright/test').BrowserContext) => Promise<void>,
  viewport?: { width: number; height: number },
) {
  const context = await browser.newContext({
    locale: 'de-DE',
    serviceWorkers: 'block',
    ...(viewport ? { viewport } : {}),
  });
  await install(context);
  const page = await context.newPage();
  return { context, page };
}

const open = async (page: Page, hash: string) => {
  await go(page, hash);
};

/** Neu laden = Sync beim App-Start (statt 60 s zu warten). */
async function resync(page: Page, hash: string) {
  await page.reload();
  await open(page, hash);
}

test('zwei Geräte: Einrichten, Beitritt, Sync und Konflikt', async ({ browser }) => {
  test.setTimeout(120_000);
  const { server, install } = createSharedServer();
  const viewport = { width: 1280, height: 900 };
  const a = await newDevice(browser, install, viewport);
  const b = await newDevice(browser, install, viewport);

  // Gerät A: verbinden, Haushalt einrichten, Eintrag erfassen
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

  // Gerät B: mit eigenem Konto verbinden, tritt bei und sieht den Eintrag
  await b.page.goto('/#/verbinden');
  await fillConnect(b.page, PERSON_B);
  await expect(b.page).toHaveURL(/#\/beitreten/);
  await b.page.getByLabel('Dein Anzeigename').fill('Person B');
  await b.page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(overviewHeading(b.page)).toBeVisible();
  await expect.poll(() => server.members.length).toBe(2);
  await resync(b.page, '#/verlauf');
  await expect(b.page.getByRole('link', { name: /Supermarkt A/ })).toBeVisible({ timeout: 20_000 });
  // Aktivität: Eintrag von Person A, für B als neu markiert
  await b.page.getByRole('button', { name: 'Aktivität' }).click();
  await expect(b.page.getByText(/Person A hat Supermarkt A, .*84,17.* hinzugefügt/)).toBeVisible();
  await expect(b.page.getByText('Neu', { exact: true }).first()).toBeVisible();

  // Gleichzeitige Änderung desselben Feldes auf beiden Geräten (beide offline)
  await open(a.page, '#/verlauf');
  await a.page.getByRole('link', { name: /Supermarkt A/ }).click();
  await open(b.page, '#/verlauf');
  await b.page.getByRole('button', { name: 'Einträge' }).click();
  await b.page.getByRole('link', { name: /Supermarkt A/ }).click();
  // Bearbeiten-Seite vorab laden (im Betrieb liefert sie der Service Worker aus dem Cache)
  for (const d of [a, b]) {
    await d.page.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(d.page.getByRole('heading', { name: 'Ausgabe bearbeiten' })).toBeVisible();
    await d.page.goBack();
    await expect(d.page.getByText('Änderungshistorie')).toBeVisible();
  }
  await a.context.setOffline(true);
  await b.context.setOffline(true);

  const edit = async (page: Page, digits: string) => {
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    for (let i = 0; i < 8; i++)
      await page.getByRole('button', { name: 'Letzte Ziffer löschen' }).click();
    for (const ch of digits) await page.getByRole('button', { name: ch, exact: true }).click();
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(page.getByText('Änderungshistorie')).toBeVisible();
  };
  await edit(a.page, '90');
  await edit(b.page, '95');

  await a.context.setOffline(false);
  await b.context.setOffline(false);
  await resync(a.page, '#/verlauf');
  await resync(b.page, '#/verlauf');
  await resync(a.page, '#/verlauf');
  await expect(a.page.getByRole('link', { name: /Supermarkt A/ })).toContainText('Konflikt', {
    timeout: 20_000,
  });
  await expect(b.page.getByRole('link', { name: /Supermarkt A/ })).toContainText('Konflikt', {
    timeout: 20_000,
  });
  // Beide Geräte zeigen denselben vorläufigen Wert
  const textA = await a.page.getByRole('link', { name: /Supermarkt A/ }).innerText();
  const textB = await b.page.getByRole('link', { name: /Supermarkt A/ }).innerText();
  expect(textA.match(/\d+,\d{2}/)?.[0]).toBe(textB.match(/\d+,\d{2}/)?.[0]);

  await a.context.close();
  await b.context.close();
});
