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
/** Alle Verlaufseinträge: auf Desktop die Tabellenzeilen im Tabellenkörper (ohne Kopfzeile), sonst die Links. */
export const historyItems = (page: Page) =>
  (page.viewportSize()?.width ?? 0) >= 1024
    ? page.locator('tbody').getByRole('row')
    : page.getByRole('link');

export const historyItem = (page: Page, name: RegExp) =>
  (page.viewportSize()?.width ?? 0) >= 1024
    ? page.getByRole('row', { name })
    : page.getByRole('link', { name });

/** Den 10. des Vormonats als `YYYY-MM-DD` (lokal), für Einträge im Durchschnitt der letzten 3 Monate. */
function tenthOfLastMonth(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 10);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-10`;
}

/**
 * Manuelle Ausgabe „Lebensmittel“ im Vormonat erfassen: Sie speist den Durchschnitt der letzten 3 Monate
 * (Projektion, Regler). Das Datum wird nach dem Erfassen über `__e2e.actions.updateEntry` gesetzt.
 */
export async function seedLastMonthEntry(page: Page, amount: string, merchant: string) {
  await captureEntry(page, { amount, category: 'Lebensmittel', merchant });
  const bookedOn = tenthOfLastMonth();
  await page.evaluate(async (bookedOn) => {
    type Row = { id: string; hlc: string };
    const w = window as unknown as {
      __e2e: {
        db: { entry: { toArray(): Promise<Row[]> } };
        actions: {
          updateEntry(db: unknown, id: string, patch: { bookedOn: string }): Promise<boolean>;
        };
      };
    };
    const { db, actions } = w.__e2e;
    const rows = await db.entry.toArray();
    const newest = rows.reduce((a, b) => (b.hlc > a.hlc ? b : a));
    await actions.updateEntry(db, newest.id, { bookedOn });
  }, bookedOn);
}

/** Wartet, bis alle laufenden CSS-Animationen fertig sind (Dialoge fahren ein; sonst Kontrast-Fehlalarm bei axe). */
export async function waitForAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // Endlos laufende Animationen (Lade-Indikatoren) enden nie und würden das Warten blockieren.
        .filter((a) => !['finished', 'idle', 'paused'].includes(a.playState))
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}
