import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { connectE2e, go, overviewHeading, settleForAxe, setupHousehold } from './helpers';

// Install-Hinweis für iOS Safari (M5 Task 6). Alle Texte sind fiktiv, Personen heißen „Person A“.

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const HINT_REGION = 'Auf dem Home-Bildschirm nutzen';
const DISMISS = 'Hinweis schließen';
const STORAGE_KEY = 'maple-jar.installHintDismissed';

/** Playwright setzt navigator.webdriver; der Hinweis ist unter Automatisierung bewusst aus. */
const hideWebdriver = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

async function ready(page: Page) {
  await connectE2e(page, 'empty');
  await setupHousehold(page);
  await go(page, '#/');
  await expect(overviewHeading(page)).toBeVisible();
}

test.describe('Install-Hinweis: iOS Safari', () => {
  test.use({ userAgent: IOS_SAFARI, viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await hideWebdriver(page);
  });

  test('erscheint nach dem Einrichten und bleibt nach dem Schließen weg', async ({ page }) => {
    await ready(page);
    const hint = page.getByRole('region', { name: HINT_REGION });
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('und wähle „Zum Home-Bildschirm“.');

    await hint.getByRole('button', { name: DISMISS }).click();
    await expect(hint).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('1');

    await page.reload();
    await go(page, '#/');
    await expect(overviewHeading(page)).toBeVisible();
    await expect(page.getByRole('region', { name: HINT_REGION })).toHaveCount(0);
  });

  test('erscheint nicht im Home-Bildschirm-Modus', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { get: () => true });
    });
    await ready(page);
    await expect(page.getByRole('region', { name: HINT_REGION })).toHaveCount(0);
  });
});

test.describe('Install-Hinweis: Automatisierung', () => {
  test.use({ userAgent: IOS_SAFARI, viewport: { width: 390, height: 844 } });

  test('navigator.webdriver ist gesetzt, deshalb kein Hinweis', async ({ page }) => {
    await ready(page);
    expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
    await expect(page.getByRole('region', { name: HINT_REGION })).toHaveCount(0);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Install-Hinweis axe (${scheme})`, () => {
    test.use({ userAgent: IOS_SAFARI, viewport: { width: 390, height: 844 }, colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      await hideWebdriver(page);
    });

    test('mit sichtbarem Hinweis ohne axe-Verstöße', async ({ page }) => {
      await ready(page);
      await expect(page.getByRole('region', { name: HINT_REGION })).toBeVisible();
      await settleForAxe(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
      ).toEqual([]);
    });
  });
}
