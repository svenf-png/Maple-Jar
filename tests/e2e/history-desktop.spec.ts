import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { captureEntry, connectE2e, go, setupHousehold, waitForAnimations } from './helpers';

const CATEGORY = 'Restaurant und Café';
const MERCHANT = 'Café B';

/** Haushalt mit einem Eintrag „Café B“ in der Kategorie „Restaurant und Café“ anlegen und zum Verlauf wechseln. */
async function setupCafeEntry(page: Page) {
  await connectE2e(page, 'empty');
  await setupHousehold(page);
  await captureEntry(page, {
    amount: '9,45',
    category: CATEGORY,
    merchant: MERCHANT,
  });
  await go(page, '#/verlauf');
  await expect(page.getByRole('table')).toBeVisible();
}

/** Die Zeile mit dem Eintrag, die Bearbeiten-Zeile liegt auf derselben Position. */
function rowWith(page: Page, text: string): Locator {
  return page.locator('tbody tr', { hasText: text });
}

/** Kategorie-Select der Bearbeiten-Zeile (der Filter „Kategorie“ oberhalb der Tabelle liegt außerhalb von tbody). */
function editCategory(page: Page): Locator {
  return page.locator('tbody').getByRole('combobox', { name: 'Kategorie' });
}

/** Zeile in den Bearbeiten-Modus schalten. */
async function startEditing(page: Page) {
  await rowWith(page, MERCHANT).getByRole('button', { name: 'Bearbeiten' }).click();
  await expect(editCategory(page)).toBeVisible();
}

/** Nächstgelegenes Elternelement der Tabelle (die Karte mit overflow-x). */
function tableContainer(page: Page): Locator {
  return page.getByRole('table').locator('xpath=..');
}

async function expectNoOverflow(page: Page, container: Locator) {
  const { scrollWidth, clientWidth } = await container.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.describe('Verlauf Desktop-Breite', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Tabelle passt bei 1280 px ohne seitliches Scrollen', async ({ page }) => {
    await setupCafeEntry(page);
    await expect(page.getByRole('table')).toBeVisible();
    await expectNoOverflow(page, tableContainer(page));

    await startEditing(page);
    await expectNoOverflow(page, tableContainer(page));
  });

  test('Kategorie-Auswahl zeigt den Namen ungekürzt', async ({ page }) => {
    await setupCafeEntry(page);
    await startEditing(page);

    const select = editCategory(page);
    await expect(select).toBeVisible();
    const result = await select.evaluate((el) => {
      const sel = el as HTMLSelectElement;
      const style = getComputedStyle(sel);
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar');
      ctx.font = style.font;
      const text = sel.selectedOptions[0]?.textContent ?? '';
      const textWidth = ctx.measureText(text).width;
      const available =
        sel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return { text, textWidth, available };
    });

    expect(result.text).toBe(CATEGORY);
    expect(result.available).toBeGreaterThanOrEqual(result.textWidth);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`axe (${scheme})`, () => {
      test.use({ colorScheme: scheme });

      test('Verlauf normal ohne Verstöße', async ({ page }) => {
        await setupCafeEntry(page);
        await waitForAnimations(page);
        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
        ).toEqual([]);
      });

      test('Verlauf im Bearbeiten-Modus ohne Verstöße', async ({ page }) => {
        await setupCafeEntry(page);
        await startEditing(page);
        await waitForAnimations(page);
        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
        ).toEqual([]);
      });
    });
  }
});
