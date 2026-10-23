import { expect, type Page, test } from '@playwright/test';
import { captureEntry, connectE2e, go, setupHousehold } from './helpers';

/** Haushalt mit Limit 150 auf „Lebensmittel“ und einer Ausgabe in „Restaurant und Café“ (ohne Limit). */
async function setupUnbudgeted(page: Page) {
  await connectE2e(page, 'empty');
  await setupHousehold(page);
  await go(page, '#/budgets');
  await page.getByRole('button', { name: 'Limit festlegen: Lebensmittel' }).click();
  await page.getByLabel('Monatslimit in CAD').fill('150');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await captureEntry(page, { amount: '123', category: 'Restaurant und Café', merchant: 'Café B' });
  await go(page, '#/');
}

test('Übersicht: Ausgabe ohne Budget belastet das Monatsbudget nicht', async ({ page }) => {
  await setupUnbudgeted(page);
  const hero = page.getByRole('region', { name: 'Budget übrig' });
  await expect(hero.getByText('Im Plan')).toBeVisible();
  await expect(hero.getByText('Über Budget')).toHaveCount(0);
  await expect(hero.getByText(/^0 von .*150.* ausgegeben$/)).toBeVisible();
  await expect(hero.getByText('Ohne Budget', { exact: true })).toBeVisible();
  await expect(hero.getByText('123,00 CA$')).toBeVisible();
});

test.describe('Übersicht Desktop-Breite', { tag: '@desktop' }, () => {
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1600, height: 1000 },
  ]) {
    test(`kein horizontaler Überlauf, Sidebar vollständig sichtbar (${size.width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await setupUnbudgeted(page);
      const m = await page.evaluate(() => {
        const aside = document.querySelector('aside');
        const r = aside?.getBoundingClientRect();
        const wide = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 6)
          .map(
            (el) =>
              `${el.tagName}.${el.getAttribute('class') ?? ''}@${Math.round(el.getBoundingClientRect().right)}`,
          );
        return {
          scrollW: document.documentElement.scrollWidth,
          innerW: window.innerWidth,
          scrollX: window.scrollX,
          asideLeft: r ? Math.round(r.left) : null,
          asideW: r ? Math.round(r.width) : null,
          wide,
        };
      });
      const info = JSON.stringify(m);
      expect(m.wide, info).toEqual([]);
      expect(m.scrollW, info).toBeLessThanOrEqual(m.innerW);
      expect(m.asideLeft, info).toBe(0);
      expect(m.asideW, info).toBe(240);
    });
  }
});
