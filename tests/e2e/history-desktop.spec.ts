import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { captureEntry, connectE2e, go, settleForAxe, setupHousehold } from './helpers';

const CATEGORY = 'Restaurant und Café';
const MERCHANT = 'Café B';

/**
 * Breite Schrift: simuliert eine deutlich breitere Ersatzschrift. Der Stress hängt nicht davon ab,
 * ob Verdana installiert ist (auf Linux-CI meist nicht): der Buchstabenabstand wirkt in jeder Schrift.
 */
const WIDE_FAMILY_CSS = '* { font-family: Verdana, sans-serif !important; }';
/**
 * Auslegungsstufe des Layouts: breite Ersatzschrift plus Buchstabenabstand 0,06 em. Alle Layout-Tests
 * (Überlauf, Namen ungekürzt, Reserve, Buttons) laufen damit. Das Layout ist für diese Stufe ausgelegt.
 */
const WIDE_FONT_CSS =
  '* { font-family: Verdana, sans-serif !important; letter-spacing: 0.06em !important; }';
/**
 * Nur Nachweis-Stufe für den 5-%-Test: 0,1 em macht den Zuwachs so groß, dass er klar über 5 % liegt.
 * Sie ist bewusst stärker als die Auslegungsstufe und wird nicht für Layout-Tests verwendet.
 */
const PROOF_FONT_CSS =
  '* { font-family: Verdana, sans-serif !important; letter-spacing: 0.1em !important; }';

/** Schriften, mit denen die Layout-Tests laufen. */
const FONTS = [
  { name: 'Systemschrift', css: null },
  { name: 'Breite Schrift', css: WIDE_FONT_CSS },
] as const;

/** Reserve (px), die der Container im Bearbeiten-Modus mindestens verkraften muss, ohne zu überlaufen. */
const RESERVE_PX = 30;

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

/**
 * Verengt den Container um `px` (Innenbreite, clientWidth) und liefert die Innenbreite davor und danach.
 * Die Rechnung berücksichtigt Padding und Rahmen, je nach box-sizing.
 */
async function narrowContainer(
  container: Locator,
  px: number,
): Promise<{ before: number; after: number }> {
  return container.evaluate((el, reduce) => {
    const before = el.clientWidth;
    const style = getComputedStyle(el);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const borderX = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    const target = before - reduce;
    el.style.width = `${style.boxSizing === 'border-box' ? target + borderX : target - padX}px`;
    return { before, after: el.clientWidth };
  }, px);
}

/** Layout-Rechteck eines Elements; wirft, wenn es nicht sichtbar ist. */
async function requireBox(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Kein Layout-Rechteck');
  return box;
}

/** Textbreite eines Elements mit dessen aktueller Schrift und Buchstabenabstand (DOM-Messung, in allen Browsern gleich). */
async function textWidth(locator: Locator, text: string): Promise<number> {
  return locator.evaluate((el, value) => {
    const style = getComputedStyle(el);
    const probe = document.createElement('span');
    probe.textContent = value;
    probe.style.cssText = [
      'position:absolute',
      'visibility:hidden',
      'white-space:nowrap',
      `font-family:${style.fontFamily}`,
      `font-size:${style.fontSize}`,
      `font-weight:${style.fontWeight}`,
      `letter-spacing:${style.letterSpacing}`,
    ].join(';');
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }, text);
}

/** Die Tabelle passt in ihren Scrollbereich: overflow-x ist `auto` und es gibt keine seitliche Überbreite. */
async function expectNoHorizontalOverflow(container: Locator) {
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
  await settleForAxe(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);
}

/** Erzwingt die Schrift für die Seite (Systemschrift lässt den Stil unverändert). */
async function applyFont(page: Page, css: string | null) {
  if (css) await page.addStyleTag({ content: css });
}

test.describe('Verlauf Desktop-Breite', { tag: '@desktop' }, () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const font of FONTS) {
    test(`Tabelle passt bei 1280 px ohne seitliches Scrollen (${font.name})`, async ({ page }) => {
      await setupCafeEntry(page);
      await applyFont(page, font.css);
      await expect(page.getByRole('table')).toBeVisible();
      await expectNoHorizontalOverflow(tableContainer(page));

      // Die Aktionsspalte bleibt im Tabellenfluss: Kopfzelle so hoch wie die übrigen Kopfzellen (Rahmenlinie läuft durch).
      const headers = page.getByRole('columnheader');
      const actionsHead = await requireBox(headers.filter({ hasText: 'Aktionen' }).first());
      const dateHead = await requireBox(headers.filter({ hasText: 'Datum' }).first());
      expect(actionsHead.width).toBeGreaterThan(1);
      expect(Math.abs(actionsHead.height - dateHead.height)).toBeLessThan(1);

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
      await expectNoHorizontalOverflow(tableContainer(page));

      // Speichern und Abbrechen stehen auf einer Linie und sind bedienbar groß.
      const saveButton = page
        .locator('tbody')
        .getByRole('button', { name: 'Speichern', exact: true });
      const cancelButton = page
        .locator('tbody')
        .getByRole('button', { name: 'Abbrechen', exact: true });
      const saveBox = await requireBox(saveButton);
      const cancelBox = await requireBox(cancelButton);
      expect(Math.abs(saveBox.y - cancelBox.y)).toBeLessThan(1);
      expect(saveBox.height).toBeGreaterThanOrEqual(44);
      expect(cancelBox.height).toBeGreaterThanOrEqual(44);
      expect(saveBox.width).toBeGreaterThanOrEqual(44);
      expect(cancelBox.width).toBeGreaterThanOrEqual(44);

      // Reserve: Der Container wird um 30 px verengt. Die Tabelle muss dann weiterhin ohne seitliches
      // Überlaufen passen, und Speichern und Abbrechen bleiben auf derselben Höhe wie vorher.
      const rowY = saveBox.y;
      const { before, after } = await narrowContainer(tableContainer(page), RESERVE_PX);
      expect(Math.abs(before - after - RESERVE_PX)).toBeLessThanOrEqual(1);
      await expectNoHorizontalOverflow(tableContainer(page));
      expect(Math.abs((await requireBox(saveButton)).y - rowY)).toBeLessThan(1);
      expect(Math.abs((await requireBox(cancelButton)).y - rowY)).toBeLessThan(1);
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

test.describe('Verlauf Desktop-Breite Schriftstress', { tag: '@desktop' }, () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Letter-Spacing-Stress macht den Kategorienamen (gleiche Ersatzschrift) mindestens 5 % breiter', async ({
    page,
  }) => {
    await setupCafeEntry(page);
    await startEditing(page);
    const select = editCategory(page);
    // Baseline: gleiche Ersatzschrift, aber ohne zusätzlichen Buchstabenabstand.
    await applyFont(page, WIDE_FAMILY_CSS);
    await page.evaluate(() => document.fonts.ready);
    const before = await textWidth(select, CATEGORY);
    // Stress: derselbe Font plus letter-spacing 0.1em. Der Zuwachs ist schriftunabhängig (je Zeichen gleich viel).
    await applyFont(page, PROOF_FONT_CSS);
    await page.evaluate(() => document.fonts.ready);
    const after = await textWidth(select, CATEGORY);
    expect(after).toBeGreaterThanOrEqual(before * 1.05);
  });
});

/** Berechnete Hintergrundfarbe eines Elements. */
function background(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

/** Zeigt die Maus auf das Element (CSS :hover)? */
function isHovered(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => el.matches(':hover'));
}

/** Relative Luminanz (0 bis 1, WCAG) aus einem berechneten `rgb(...)`- oder `rgba(...)`-String. */
function luminance(color: string): number {
  const m = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!m) throw new Error(`Keine rgb-Farbe: ${color}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Beweist, dass das angeforderte Farbschema tatsächlich greift: Media-Query, Seitenhintergrund (--bg)
 * und Kartenfläche (--card) werden über ihre Luminanz geprüft, ohne Hex-Literale zu hartcodieren.
 */
async function expectScheme(page: Page, scheme: 'light' | 'dark') {
  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
    .toBe(scheme === 'dark');
  const resolved = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.background = 'var(--card)';
    document.body.append(probe);
    const card = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { body: getComputedStyle(document.body).backgroundColor, card };
  });
  expect(resolved.body).not.toBe('rgba(0, 0, 0, 0)');
  expect(resolved.card).not.toBe('rgba(0, 0, 0, 0)');
  if (scheme === 'light') {
    expect(luminance(resolved.body)).toBeGreaterThan(0.5);
    expect(luminance(resolved.card)).toBeGreaterThan(0.5);
  } else {
    expect(luminance(resolved.body)).toBeLessThan(0.2);
    expect(luminance(resolved.card)).toBeLessThan(0.2);
  }
}

// Hover-Zustände gelten nur mit (hover: hover), also nur auf Desktop-Projekten.
test.describe('Verlauf Desktop-Breite Hover', { tag: '@desktop' }, () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Icon-Button „Bearbeiten“ wechselt bei Hover die Hintergrundfarbe', async ({ page }) => {
    await setupCafeEntry(page);
    const edit = rowWith(page, MERCHANT).getByRole('button', { name: 'Bearbeiten' });
    const before = await background(edit);
    await edit.hover();
    await expect.poll(() => isHovered(edit)).toBe(true);
    // Übergang 0,12 s: der Wert wird gepollt, bis er sich geändert hat.
    await expect.poll(() => background(edit)).not.toBe(before);
    expect(await background(edit)).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('Filter „Kategorie“ wechselt bei Hover die Hintergrundfarbe des Chips ohne Verschiebung', async ({
    page,
  }) => {
    await setupCafeEntry(page);
    const filter = page.getByRole('combobox', { name: 'Kategorie', exact: true });
    // Die Chip-Zeile (FilterChip) färbt den Rahmen um das Select; das Select selbst ist transparent.
    const chip = filter.locator('..');
    const before = await background(chip);
    await filter.hover();
    await expect.poll(() => isHovered(filter)).toBe(true);
    await expect.poll(() => background(chip)).not.toBe(before);
    expect(await background(chip)).not.toBe('rgba(0, 0, 0, 0)');
    expect(await chip.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });
});

// axe läuft auf allen Projekten, auch mobil. Das Farbschema kommt per test.use; expectScheme prüft, dass es greift.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Verlauf Desktop-Breite axe (${scheme})`, () => {
    test.use({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });

    test('Verlauf normal ohne Verstöße', async ({ page }) => {
      await setupCafeEntry(page);
      await expectScheme(page, scheme);
      await expectNoViolations(page);
    });

    test('Verlauf im Bearbeiten-Modus ohne Verstöße', async ({ page }) => {
      await setupCafeEntry(page);
      await startEditing(page);
      await expectScheme(page, scheme);
      await expectNoViolations(page);
    });

    test('Fixkosten-Formular mit Wiederholungs-Auswahl ohne Verstöße', async ({ page }) => {
      await connectE2e(page, 'empty');
      await setupHousehold(page);
      await go(page, '#/fixkosten/neu');
      const repeat = page.getByRole('combobox', { name: 'Wiederholung' });
      await expect(repeat).toBeVisible();
      // Die Zeile bleibt einzeilig: Label und Auswahl liegen auf einer Linie, die Seite läuft nicht über.
      const label = await requireBox(page.getByText('Wiederholung', { exact: true }));
      const select = await requireBox(repeat);
      expect(Math.abs(label.y + label.height / 2 - (select.y + select.height / 2))).toBeLessThan(2);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await expectScheme(page, scheme);
      await expectNoViolations(page);
    });
  });
}

// Kein @desktop-Tag: die Prüfung läuft auch auf den Mobil-Projekten.
for (const { name, width, expected } of [
  { name: 'Mobil (390 px)', width: 390, expected: null },
  { name: 'Desktop (1280 px)', width: 1280, expected: 720 },
] as const) {
  test.describe(`Verlauf Tabs und Aktivitäts-Feed ${name}`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('Tab-Leiste ist so breit wie die Suche (Desktop 720 px, mobil volle Breite)', async ({ page }) => {
      await connectE2e(page, 'empty');
      await setupHousehold(page);
      await go(page, '#/verlauf');
      const tabs = await requireBox(page.getByRole('group', { name: 'Ansicht' }));
      const search = await requireBox(
        page.getByRole('searchbox', { name: 'Händler, Notiz, Betrag' }),
      );
      expect(Math.abs(tabs.width - search.width)).toBeLessThan(1.5);
      if (expected) expect(Math.abs(tabs.width - expected)).toBeLessThan(1.5);
      else expect(tabs.width).toBeGreaterThan(width - 80);
    });

    test('Tagesgruppen im Aktivitäts-Feed haben den Abstand --s-3 (12 px)', async ({ page }) => {
      await connectE2e(page, 'empty');
      await setupHousehold(page);
      // Zwei Tage Daten: das Datum des Ereignisses folgt der Uhr der Seite.
      await page.clock.setFixedTime(new Date('2026-03-10T12:00:00'));
      await captureEntry(page, { amount: '5,00', category: CATEGORY, merchant: 'Café B' });
      await page.clock.setFixedTime(new Date('2026-03-11T12:00:00'));
      await captureEntry(page, { amount: '6,00', category: CATEGORY, merchant: 'Café C' });
      await go(page, '#/verlauf');
      await page.getByRole('button', { name: 'Aktivität' }).click();
      const days = page.locator('main section[aria-label]');
      await expect(days).toHaveCount(2);
      const first = await requireBox(days.nth(0));
      const second = await requireBox(days.nth(1));
      expect(Math.round(second.y - (first.y + first.height))).toBe(12);
      if (expected) expect(Math.abs(first.width - expected)).toBeLessThan(1.5);
    });
  });
}
