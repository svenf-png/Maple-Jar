import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { captureEntry, connectE2e, go, setupHousehold, waitForAnimations } from './helpers';

const CATEGORY = 'Restaurant und Café';
const MERCHANT = 'Café B';

/** Schriften, mit denen die Layout-Tests laufen. Verdana ist deutlich breiter als die Systemschrift. */
const FONTS = [
  { name: 'Systemschrift', css: null },
  { name: 'Verdana', css: '* { font-family: Verdana, sans-serif !important; }' },
] as const;

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

/**
 * Zeile mit dem Eintrag. Vor dem Bearbeiten steht der Händler als Text in der Zeile;
 * im Bearbeiten-Modus ist er ein Eingabefeld. Der Helfer wird deshalb nur vor dem Bearbeiten genutzt.
 */
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

/** Die Tabelle passt in ihren Scrollbereich: overflow-x ist `auto` und es gibt keine seitliche Überbreite. */
async function expectNoHorizontalOverflow(page: Page, container: Locator) {
  const info = await container.evaluate((el) => ({
    overflowX: getComputedStyle(el).overflowX,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(info.overflowX).toBe('auto');
  expect(info.scrollWidth).toBeLessThanOrEqual(info.clientWidth);
}

/** Axe-Prüfung ohne Verstöße. */
async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);
}

/** Erzwingt die Schrift für die Seite (Systemschrift lässt den Stil unverändert). */
async function applyFont(page: Page, css: string | null) {
  if (css) await page.addStyleTag({ content: css });
}

test.describe('Verlauf Desktop-Breite', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  // Layout-Messungen gelten nur für den Desktop; auf den Mobil-Projekten entfallen sie.
  test.skip(({ isMobile }) => isMobile, 'nur Desktop');

  for (const font of FONTS) {
    test(`Tabelle passt bei 1280 px ohne seitliches Scrollen (${font.name})`, async ({ page }) => {
      await setupCafeEntry(page);
      await applyFont(page, font.css);
      await expect(page.getByRole('table')).toBeVisible();
      await expectNoHorizontalOverflow(page, tableContainer(page));

      // Suche und Filter bleiben bei 720 px, die Tabelle nutzt die volle Breite.
      const searchBox = await page
        .locator('input[type="search"]')
        .locator('xpath=ancestor::label[1]')
        .boundingBox();
      const filterBox = await page
        .getByRole('combobox', { name: 'Zeitraum' })
        .locator('xpath=ancestor::div[1]')
        .boundingBox();
      const tableBox = await tableContainer(page).boundingBox();
      expect(searchBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(720);
      expect(filterBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(720);
      expect(tableBox?.width ?? 0).toBeGreaterThan(720);

      await startEditing(page);
      await expectNoHorizontalOverflow(page, tableContainer(page));
    });

    test(`Kategorie-Auswahl zeigt den Namen ungekürzt (${font.name})`, async ({ page }) => {
      await setupCafeEntry(page);
      await applyFont(page, font.css);
      await startEditing(page);

      const select = editCategory(page);
      await expect(select).toBeVisible();
      const result = await select.evaluate((el) => {
        const sel = el as HTMLSelectElement;
        const style = getComputedStyle(sel);
        const ctx = document.createElement('canvas').getContext('2d');
        if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar');
        ctx.font = style.font;
        ctx.letterSpacing = style.letterSpacing;
        const text = sel.selectedOptions[0]?.textContent ?? '';
        const textWidth = ctx.measureText(text).width;
        const available =
          sel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return { text, textWidth, available };
      });

      expect(result.text).toBe(CATEGORY);
      expect(result.available).toBeGreaterThanOrEqual(result.textWidth);
    });
  }
});

// axe läuft auf allen Projekten, auch mobil.
test.describe('Verlauf Desktop-Breite axe', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`axe (${scheme})`, () => {
      test.use({ colorScheme: scheme });

      test('Verlauf normal ohne Verstöße', async ({ page }) => {
        await setupCafeEntry(page);
        await waitForAnimations(page);
        await expectNoViolations(page);
      });

      test('Verlauf im Bearbeiten-Modus ohne Verstöße', async ({ page }) => {
        await setupCafeEntry(page);
        await startEditing(page);
        await waitForAnimations(page);
        await expectNoViolations(page);
      });
    });
  }
});
