import { expect, type Page, test } from '@playwright/test';
import { connectE2e, go, overviewHeading, setupHousehold, typeAmount } from './helpers';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function ready(page: Page) {
  await connectE2e(page, 'empty');
  await setupHousehold(page);
  await go(page, '#/');
  await expect(overviewHeading(page)).toBeVisible();
}

const entryCount = (page: Page) =>
  page.evaluate(async () => {
    const w = window as unknown as { __e2e: { db: { entry: { count(): Promise<number> } } } };
    return w.__e2e.db.entry.count();
  });

test.describe('Haptik: Automatisierung', () => {
  test('navigator.webdriver ist unter Playwright gesetzt, kein Overlay, Speichern funktioniert', async ({
    page,
  }) => {
    await ready(page);
    expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
    await go(page, '#/erfassen');
    await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
    await expect(page.locator('[data-haptic-switch]')).toHaveCount(0);
    await typeAmount(page, '5');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible();
    expect(await entryCount(page)).toBe(1);
  });
});

test.describe('Haptik: iOS-Overlay', () => {
  test.use({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    // Playwright setzt navigator.webdriver; das Overlay ist nur ohne Automatisierung aktiv.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
  });

  test('ein Tap auf das Overlay speichert genau einmal, Tastatur über die Schaltfläche speichert ebenfalls einmal', async ({
    page,
  }) => {
    await ready(page);
    await go(page, '#/erfassen');
    await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
    expect(await page.evaluate(() => navigator.webdriver)).toBe(false);

    await typeAmount(page, '5');
    await page.getByRole('button', { name: 'Lebensmittel' }).click();
    await page.locator('[data-haptic-switch]').click();
    await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible();
    expect(await entryCount(page)).toBe(1);

    await typeAmount(page, '7');
    const save = page.getByRole('button', { name: 'Speichern', exact: true });
    await save.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => entryCount(page)).toBe(2);
  });
});
