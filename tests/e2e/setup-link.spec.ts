import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { buildSetupLink } from '../../src/data/setup-link';
import { ANON_KEY, PERSON_A, PROJECT_URL } from './fixtures/household';
import { overviewHeading, settleForAxe, setupHousehold } from './helpers';

const link = buildSetupLink('https://app.example/', { projectUrl: PROJECT_URL, anonKey: ANON_KEY });
const fragment = link.slice(link.indexOf('#'));

async function signIn(page: import('@playwright/test').Page) {
  await page.getByLabel('Benutzername').fill(PERSON_A.username);
  await page.getByLabel('Passwort').fill(PERSON_A.password);
  await page.getByRole('button', { name: 'Verbinden' }).click();
}

test('Einrichtungslink: nur Benutzername und Passwort, Fragment wird entfernt', async ({
  page,
}) => {
  await page.goto(`/?e2e=empty${fragment}`);
  await expect(page.getByText('Projekt: e2e-project.supabase.co')).toBeVisible();
  await expect(page.getByLabel('Projekt-URL')).toHaveCount(0);
  await expect(page.getByLabel('Öffentlicher Schlüssel')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/verbinden$/);
  expect(page.url()).not.toContain(ANON_KEY);
  await signIn(page);
  await setupHousehold(page);
  await expect(overviewHeading(page)).toBeVisible();
});

test('Einrichtungslink: Zugang bleibt nach Neuladen erhalten, „Ändern“ zeigt die Felder', async ({
  page,
}) => {
  await page.goto(`/?e2e=empty${fragment}`);
  await expect(page.getByText('Projekt: e2e-project.supabase.co')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Projekt: e2e-project.supabase.co')).toBeVisible();
  await page.getByRole('button', { name: 'Ändern' }).click();
  await expect(page.getByLabel('Projekt-URL')).toBeVisible();
  await expect(page.getByLabel('Öffentlicher Schlüssel')).toBeVisible();
});

test('Link in das Feld einfügen füllt den Zugang, ungültiger Link zeigt einen Fehler', async ({
  page,
}) => {
  await page.goto('/?e2e=empty#/verbinden');
  await page
    .getByLabel('Einrichtungslink einfügen')
    .fill('https://app.example/#/verbinden?u=x&k=y');
  await expect(page.getByRole('alert')).toContainText('Link ist ungültig');
  await page.getByLabel('Einrichtungslink einfügen').fill(link);
  await expect(page.getByText('Projekt: e2e-project.supabase.co')).toBeVisible();
  await signIn(page);
  await setupHousehold(page);
});

test('Einstellungen: Einrichtungslink erzeugen, Bildschirm ohne axe-Verstöße', async ({ page }) => {
  await page.goto(`/?e2e=empty${fragment}`);
  await signIn(page);
  await setupHousehold(page);
  await page.evaluate(() => {
    window.location.hash = '#/einstellungen';
  });
  await page.getByRole('button', { name: 'Link erstellen' }).click();
  const field = page.getByLabel('Weiteres Gerät einrichten');
  await expect(field).toHaveValue(/#\/verbinden\?u=.*&k=/);
  await settleForAxe(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
