import { expect, type Page } from '@playwright/test';
import { ANON_KEY, PERSON_A, PROJECT_URL } from './fixtures/household';

type Person = { username: string; password: string };

/** Verbinden gegen den Testmodus (`?e2e=<szenario>`, Server im Seitenspeicher). */
export async function connectE2e(page: Page, scenario: string, person: Person = PERSON_A) {
  await page.goto(`/?e2e=${scenario}#/verbinden`);
  await fillConnect(page, person);
}

export async function fillConnect(page: Page, person: Person) {
  await page.getByLabel('Projekt-URL').fill(PROJECT_URL);
  await page.getByLabel('Öffentlicher Schlüssel').fill(ANON_KEY);
  await page.getByLabel('Benutzername').fill(person.username);
  await page.getByLabel('Passwort').fill(person.password);
  await page.getByRole('button', { name: 'Verbinden' }).click();
}

/** Haushalt einrichten (Standardkategorien an) und auf der Übersicht landen. */
export async function setupHousehold(page: Page, name = 'Person A') {
  await expect(page).toHaveURL(/#\/einrichten/);
  await page.getByLabel('Haushaltsname').fill('Testhaushalt');
  await page.getByLabel('Dein Anzeigename').fill(name);
  await page.getByRole('button', { name: 'Haushalt anlegen' }).click();
  await expect(page).toHaveURL(/#\/$/);
}

/** In-App-Navigation ohne Neuladen (der Testserver lebt im Seitenspeicher). */
export async function go(page: Page, hash: string) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await expect(page).toHaveURL(new RegExp(`${hash.replace('#', '#')}$`));
}

/** Betrag über den Ziffernblock eingeben, z. B. "84,17". */
export async function typeAmount(page: Page, text: string) {
  for (const ch of text) {
    const name = ch === ',' ? /^[,.]$/ : ch;
    await page.getByRole('button', { name, exact: typeof name === 'string' }).click();
  }
}

/** Neue Ausgabe erfassen und das Häkchen-Feedback abwarten. */
export async function captureEntry(
  page: Page,
  opts: { amount: string; category?: string; merchant?: string; currency?: 'CAD' | 'EUR' },
) {
  await go(page, '#/erfassen');
  await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
  if (opts.currency === 'EUR') await page.getByRole('button', { name: 'EUR', exact: true }).click();
  await typeAmount(page, opts.amount);
  if (opts.category) await page.getByRole('button', { name: opts.category }).click();
  if (opts.merchant) await page.getByLabel('Händler oder Notiz (optional)').fill(opts.merchant);
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible();
}

/** Die Übersicht trägt den aktuellen Monat als Überschrift. */
export const overviewHeading = (page: Page) =>
  page.getByRole('heading', {
    level: 1,
    name: new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date()),
  });

/** Verlaufseintrag: auf Desktop die Tabellenzeile (trägt Beträge und Original), sonst der Link der Mobil-Liste. */
export const historyItem = (page: Page, name: RegExp) =>
  (page.viewportSize()?.width ?? 0) >= 1024
    ? page.getByRole('row', { name })
    : page.getByRole('link', { name });
