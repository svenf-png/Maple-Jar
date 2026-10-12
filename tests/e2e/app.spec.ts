import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { REPO, VALID_TOKEN } from './fixtures/household';

const url = (scenario: string) => `/?store=memory&scenario=${scenario}#/verbinden`;

/** Wartet bei vorhandenem Haushalt, bis die Sitzung gespeichert und die Übersicht offen ist. */
async function connectMember(page: Page) {
  await connect(page, 'member');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
}

async function connect(page: Page, scenario: string, token = VALID_TOKEN) {
  await page.goto(url(scenario));
  await page.getByLabel('Daten-Repo').fill(REPO);
  await page.getByLabel('Zugangsschlüssel').fill(token);
  await page.getByRole('button', { name: 'Verbinden' }).click();
}

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

async function setupHousehold(page: Page) {
  await page.getByLabel('Haushaltsname').fill('Testhaushalt');
  await page.getByLabel('Dein Anzeigename').fill('Person A');
  await page.getByLabel('GitHub-Login').fill('person-b');
  await page.getByLabel('Anzeigename', { exact: true }).fill('Person B');
  await page.getByRole('button', { name: 'Haushalt anlegen' }).click();
}

test('1: falscher Schlüssel zeigt eine Fehlermeldung', async ({ page }) => {
  await connect(page, 'empty', 'falsch');
  await expect(page.getByRole('alert')).toContainText('Zugangsschlüssel ungültig oder abgelaufen');
  await expect(page).toHaveURL(/#\/verbinden/);
});

test('2: ohne household.json → Einrichten → Übersicht', async ({ page }) => {
  await connect(page, 'empty');
  await expect(page).toHaveURL(/#\/einrichten/);
  await setupHousehold(page);
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
});

test('3: vorhandener Haushalt (Mitglied) → direkt Übersicht', async ({ page }) => {
  await connect(page, 'member');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  if (!isDesktop(page)) {
    await expect(page.getByRole('img', { name: 'Person A' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Person B' })).toBeVisible();
  }
});

test('3b: Konto ohne Mitgliedschaft, erst eine Person eingetragen → Hinweis', async ({ page }) => {
  await connect(page, 'solo');
  await expect(page.getByRole('alert')).toContainText(
    'Bitte von der ersten Person eintragen lassen',
  );
});

test('4: Darstellung Dunkel bleibt nach Neuladen', async ({ page }) => {
  await connectMember(page);
  await page.goto('/#/einstellungen');
  await page.getByRole('button', { name: 'Dunkel' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('5: Sprache EN stellt Texte um', async ({ page }) => {
  await page.goto(url('empty'));
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByText('Your shared household budget.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('6: Tabbar mobil, Seitenleiste auf Desktop', async ({ page }) => {
  await connectMember(page);
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  if (isDesktop(page)) {
    const side = await page.locator('aside').boundingBox();
    expect(side?.x).toBe(0);
    expect(side?.width).toBeLessThan(300);
    await expect(page.getByRole('button', { name: 'Ausgabe erfassen' })).toBeVisible();
  } else {
    const vh = page.viewportSize()?.height ?? 0;
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(vh - 2);
    await page.getByRole('button', { name: 'Ausgabe erfassen' }).click();
    await expect(page.getByRole('status')).toContainText('Kommt in M2');
  }
  await expect(nav.getByRole('link', { name: 'Übersicht' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('7: App-Shell lädt nach dem ersten Besuch auch offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Maple Jar' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`8: axe (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    const check = async (page: Page) => {
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
      ).toEqual([]);
    };

    test('Verbinden', async ({ page }) => {
      await page.goto(url('empty'));
      await expect(page.getByRole('heading', { name: 'Maple Jar' })).toBeVisible();
      await check(page);
    });

    test('Einrichten', async ({ page }) => {
      await connect(page, 'empty');
      await expect(page.getByRole('heading', { name: 'Haushalt einrichten' })).toBeVisible();
      await check(page);
    });

    test('Einstellungen', async ({ page }) => {
      await connectMember(page);
      await page.goto('/#/einstellungen');
      await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
      await check(page);
    });
  });
}

test('Abmelden löscht die Sitzung', async ({ page }) => {
  await connectMember(page);
  await page.goto('/#/einstellungen');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/#\/verbinden/);
  await page.reload();
  await expect(page).toHaveURL(/#\/verbinden/);
});
