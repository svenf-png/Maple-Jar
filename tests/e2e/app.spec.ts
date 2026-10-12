import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { ANON_KEY, PERSON_A, PERSON_C, PROJECT_URL } from './fixtures/household';

const url = (scenario: string) => `/?e2e=${scenario}#/verbinden`;

type Person = { username: string; password: string };

/** Wartet bei vorhandenem Haushalt, bis die Sitzung gespeichert und die Übersicht offen ist. */
async function connectMember(page: Page) {
  await connect(page, 'member');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
}

async function connect(page: Page, scenario: string, person: Person = PERSON_A, password?: string) {
  await page.goto(url(scenario));
  await page.getByLabel('Projekt-URL').fill(PROJECT_URL);
  await page.getByLabel('Öffentlicher Schlüssel').fill(ANON_KEY);
  await page.getByLabel('Benutzername').fill(person.username);
  await page.getByLabel('Passwort').fill(password ?? person.password);
  await page.getByRole('button', { name: 'Verbinden' }).click();
}

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

async function setupHousehold(page: Page) {
  await page.getByLabel('Haushaltsname').fill('Testhaushalt');
  await page.getByLabel('Dein Anzeigename').fill('Person A');
  await page.getByRole('button', { name: 'Haushalt anlegen' }).click();
}

test('1: falsches Passwort zeigt eine Fehlermeldung', async ({ page }) => {
  await connect(page, 'empty', PERSON_A, 'falsch');
  await expect(page.getByRole('alert')).toContainText('Benutzername oder Passwort stimmt nicht');
  await expect(page).toHaveURL(/#\/verbinden/);
});

test('1b: ungültige Eingaben werden vor dem Absenden abgefangen', async ({ page }) => {
  await page.goto(url('empty'));
  await page.getByLabel('Projekt-URL').fill('https://evil.example.com');
  await page.getByRole('button', { name: 'Verbinden' }).click();
  await expect(page.getByRole('alert')).toContainText('Projekt-URL');
  await page.getByLabel('Projekt-URL').fill(PROJECT_URL);
  await page.getByLabel('Öffentlicher Schlüssel').fill(ANON_KEY);
  await page.getByLabel('Benutzername').fill('Person A');
  await page.getByRole('button', { name: 'Verbinden' }).click();
  await expect(page.getByRole('alert')).toContainText('Benutzername darf nur');
});

test('2: noch kein Haushalt → Einrichten → Übersicht', async ({ page }) => {
  await connect(page, 'empty');
  await expect(page).toHaveURL(/#\/einrichten/);
  await setupHousehold(page);
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  await page.goto('/#/einstellungen');
  await expect(page.getByText('Noch keine zweite Person eingetragen')).toBeVisible();
});

test('3: vorhandener Haushalt (Mitglied) → direkt Übersicht, Status „Verbunden“', async ({
  page,
}) => {
  await connect(page, 'member');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  if (!isDesktop(page)) {
    await expect(page.getByRole('img', { name: 'Person A' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Person B' })).toBeVisible();
    await expect(page.getByText('Verbunden', { exact: true })).toBeVisible();
  }
});

test('3b: zweite Person tritt beim ersten Login bei', async ({ page }) => {
  await connect(page, 'solo', PERSON_A);
  await expect(page).toHaveURL(/#\/beitreten/);
  await page.getByLabel('Dein Anzeigename').fill('Person A');
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.goto('/#/einstellungen');
  await expect(page.getByText('Gemeinsamer Haushalt mit Person B')).toBeVisible();
});

test('3c: fremdes Konto bei vollem Haushalt wird abgewiesen', async ({ page }) => {
  await connect(page, 'member', PERSON_C);
  await expect(page.getByRole('alert')).toContainText(
    'Dieses Konto gehört nicht zu diesem Haushalt',
  );
  await expect(page).toHaveURL(/#\/verbinden/);
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

    test('Beitreten', async ({ page }) => {
      await connect(page, 'solo', PERSON_A);
      await expect(page.getByRole('heading', { name: 'Haushalt beitreten' })).toBeVisible();
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

test('Export lädt eine JSON-Datei mit den Ereignissen', async ({ page }) => {
  await connect(page, 'empty');
  await setupHousehold(page);
  await expect(page).toHaveURL(/#\/$/);
  await page.goto('/#/einstellungen');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportieren' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^maple-jar-export-\d{4}-\d{2}-\d{2}\.json$/);
});

test('Abmelden löscht die Sitzung', async ({ page }) => {
  await connectMember(page);
  await page.goto('/#/einstellungen');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/#\/verbinden/);
  await page.reload();
  await expect(page).toHaveURL(/#\/verbinden/);
});
