import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { connectE2e, go, setupHousehold } from './helpers';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`M3 Teil B Fundament (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('Planung: Tab zeigt die neue Seite, axe ohne Verstöße', async ({ page }) => {
      await connectE2e(page, 'empty');
      await setupHousehold(page);
      await go(page, '#/planung');
      await expect(page.getByRole('heading', { level: 1, name: 'Planung' })).toBeVisible();
      await expect(page.getByText('In Arbeit')).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
      ).toEqual([]);
      await go(page, '#/ziel/neu');
      await expect(page.getByRole('heading', { level: 1, name: 'Neues Ziel' })).toBeVisible();
    });
  });
}
