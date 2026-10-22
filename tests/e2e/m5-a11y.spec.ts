import { expect, type Page, test } from '@playwright/test';
import { todayIso } from '../../src/data/today';
import { addDays } from '../../src/domain/schedule';
import {
  connectE2e,
  go,
  historyItem,
  overviewHeading,
  setupHousehold,
  typeAmount,
  waitForAnimations,
} from './helpers';

// Fokusführung, 44-px-Ziele und Reduced Motion (M5 Task 4). Alle Testdaten sind fiktiv
// („Supermarkt A“, „Sparziel A“, „Streaming-Abo A“) und entstehen über `window.__e2e` (nur im E2E-Build).

const today = todayIso();
const monthStart = `${today.slice(0, 7)}-01`;

type E2eWindow = {
  __e2e: {
    db: {
      category: { toArray(): Promise<Array<{ id: string; name: string }>> };
      entry: { toArray(): Promise<Array<{ id: string; hlc: string }>> };
      conflicts: { put(row: unknown): Promise<unknown> };
    };
    actions: Record<string, (...args: unknown[]) => Promise<string>>;
  };
};

/** Legt eine Zeile über die App-Aktionen an und liefert ihre Kennung. */
async function seed(page: Page, kind: string, data: Record<string, unknown>): Promise<string> {
  return page.evaluate(
    async ({ kind, data }) => {
      const { db, actions } = (window as unknown as E2eWindow).__e2e;
      const cats = await db.category.toArray();
      const categoryId = (cats.find((c) => c.name === 'Lebensmittel') ?? cats[0])?.id;
      if (kind === 'budget')
        return String(await actions.setBudget?.(db, categoryId, data.month, data.limit));
      const fn = { income: 'createIncome', fixed: 'createFixedCost', goal: 'createGoal' }[kind];
      const input = kind === 'fixed' ? { categoryId, ...data } : data;
      return fn ? String((await actions[fn]?.(db, input)) ?? '') : '';
    },
    { kind, data },
  );
}

/** Eine Ausgabe „Supermarkt A“ über die Erfassung; liefert die Kennung des neuesten Eintrags. */
async function seedEntry(page: Page): Promise<string> {
  await go(page, '#/erfassen');
  await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
  await typeAmount(page, '84,17');
  await page.getByRole('button', { name: 'Lebensmittel' }).click();
  await page.getByLabel('Händler oder Notiz (optional)').fill('Supermarkt A');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible();
  return page.evaluate(async () => {
    const { db } = (window as unknown as E2eWindow).__e2e;
    const rows = await db.entry.toArray();
    return rows.reduce((a, b) => (b.hlc > a.hlc ? b : a)).id;
  });
}

/** Ein offener Konflikt in der lokalen Datenbank, damit der Konflikt-Banner der Übersicht erscheint. */
async function seedConflict(page: Page, rowId: string) {
  await page.evaluate(async (rowId) => {
    const { db } = (window as unknown as E2eWindow).__e2e;
    await db.conflicts.put({
      id: `entry:${rowId}`,
      entity: 'entry',
      rowId,
      kind: 'deleteVsEdit',
      fields: [],
      eventIds: [],
    });
  }, rowId);
}

async function start(page: Page) {
  await connectE2e(page, 'empty');
  await setupHousehold(page);
}

/* ---------- Fokusführung ---------- */

test.describe('Fokusführung', () => {
  test('Seitenwechsel setzt den Fokus auf die Überschrift', async ({ page }) => {
    await start(page);
    await page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name: 'Verlauf' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Verlauf' })).toBeFocused();

    await page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name: 'Einstellungen' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeFocused();

    await page.getByRole('link', { name: 'Kategorien' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kategorien' })).toBeFocused();
  });

  test('Erstes Laden setzt keinen Fokus', async ({ page }) => {
    await start(page);
    await go(page, '#/verlauf');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Verlauf' })).toBeVisible();
    await expect(page.locator('body')).toBeFocused();
  });

  test('Fokus liegt nicht hinter der Tabbar (mobil)', async ({ page }) => {
    // Die Tabbar gibt es nur unter 1024 px; auf dem Desktop gibt es nichts zu prüfen.
    if ((page.viewportSize()?.width ?? 0) >= 1024) return;
    await start(page);
    await seedEntry(page);
    await go(page, '#/einstellungen');
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
    await page.getByRole('button', { name: 'Daten exportieren (JSON)' }).focus();
    await page.keyboard.press('Tab');
    const csv = page.getByRole('button', { name: 'Einträge exportieren (CSV)' });
    await expect(csv).toBeFocused();
    await waitForAnimations(page);
    const button = await csv.boundingBox();
    const nav = await page.getByRole('navigation', { name: 'Hauptnavigation' }).boundingBox();
    expect(button).not.toBeNull();
    expect(nav).not.toBeNull();
    expect((button?.y ?? 0) + (button?.height ?? 0)).toBeLessThanOrEqual(nav?.y ?? 0);
  });

  test('Dialog gibt den Fokus an den Auslöser zurück (Escape und Abbrechen)', async ({ page }) => {
    await start(page);
    await go(page, '#/einstellungen');
    const logout = page.getByRole('button', { name: 'Abmelden', exact: true });
    await logout.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(logout).toBeFocused();

    await logout.focus();
    await page.keyboard.press('Enter');
    const cancel = page.getByRole('dialog').getByRole('button', { name: 'Abbrechen', exact: true });
    await cancel.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(logout).toBeFocused();
  });

  test('Fokus, der nach dem Seitenwechsel gesetzt wird, bleibt erhalten', async ({ page }) => {
    // Langsame Frames deterministisch simulieren: der Rückruf läuft 300 ms später. `framesRun` zählt
    // die ausgeführten Rückrufe, damit der Test erst prüft, nachdem die Fokusführung gelaufen ist.
    await page.addInitScript(() => {
      const w = window as unknown as { framesRun: number };
      w.framesRun = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        setTimeout(
          () =>
            orig((t) => {
              cb(t);
              w.framesRun += 1;
            }),
          300,
        );
        return 0;
      };
    });
    await start(page);
    const framesBefore = await page.evaluate(
      () => (window as unknown as { framesRun: number }).framesRun,
    );
    await go(page, '#/ziel/neu');
    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Sparziel A');
    await page.waitForFunction(
      (before) => (window as unknown as { framesRun: number }).framesRun > before,
      framesBefore,
    );
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('Sparziel A');

    await go(page, '#/verlauf');
    await expect(page.getByRole('heading', { level: 1, name: 'Verlauf' })).toBeFocused();
  });
});

/* ---------- 44-px-Ziele ---------- */

/** Ausnahmen (CSS-Selektoren), die die 44-px-Regel nicht erfüllen können. Bisher keine. */
const ALLOWED: string[] = [];

/** Liefert alle interaktiven Elemente, die kleiner als 44 px sind (mit Name und Maßen). */
async function smallTargets(page: Page, allowed: string[] = ALLOWED): Promise<string[]> {
  return page.evaluate((allowed) => {
    const selector = [
      'a[href]',
      'button',
      'input:not([type=hidden])',
      'select',
      'textarea',
      'summary',
      '[role=button]',
      '[role=radio]',
      '[role=switch]',
      '[role=tab]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (el.closest('[aria-hidden="true"], [hidden], dialog:not([open])')) continue;
      if (el.hasAttribute('data-haptic-switch')) continue;
      if (el.matches('a') && el.closest('p, dd')) continue;
      if (allowed.some((s) => el.matches(s))) continue;
      // Eingaben in einem Label werden am Label gemessen (das Label ist die Trefferfläche).
      const box = (el.closest('label') ?? el).getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.width >= 43.5 && box.height >= 43.5) continue;
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
      const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
      const id = el.id ? `#${el.id}` : '';
      out.push(
        `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ''} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`,
      );
    }
    return out;
  }, allowed);
}

test('Alle Hauptseiten: interaktive Ziele sind mindestens 44 px', async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await seed(page, 'budget', { month: today, limit: 50000 });
  await seed(page, 'fixed', {
    name: 'Streaming-Abo A',
    amountMinor: 1500,
    currency: 'CAD',
    isSaving: false,
    autobook: false,
    unit: 'month',
    every: 1,
    startsOn: today,
  });
  await seed(page, 'income', {
    name: 'Einnahme A',
    amountMinor: 300000,
    currency: 'CAD',
    unit: 'month',
    every: 1,
    startsOn: monthStart,
  });
  const goalId = await seed(page, 'goal', {
    name: 'Sparziel A',
    icon: 'sonstiges',
    color: '#2C6CB0',
    targetMinor: 120000,
    currency: 'CAD',
    startsOn: addDays(today, -90),
    targetDate: addDays(today, 90),
  });
  const entryId = await seedEntry(page);

  const failures: string[] = [];
  const check = async (hash: string, ready: () => Promise<void>) => {
    await go(page, hash);
    await ready();
    await waitForAnimations(page);
    const small = await smallTargets(page);
    if (small.length) failures.push(`${hash}: ${small.join(' | ')}`);
  };

  await check('#/verlauf', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Verlauf' })).toBeVisible();
    await expect(historyItem(page, /Supermarkt A/)).toBeVisible();
  });
  // Desktop: die Bearbeiten-Zeile der Tabelle (SelectField `edit`, Betragsfeld, Speichern/Abbrechen).
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await historyItem(page, /Supermarkt A/)
      .getByRole('button', { name: 'Bearbeiten' })
      .click();
    // Der Filter „Kategorie“ oberhalb der Tabelle liegt außerhalb von tbody.
    const editCategory = page.locator('tbody').getByRole('combobox', { name: 'Kategorie' });
    await expect(editCategory).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abbrechen' })).toBeEnabled();
    await waitForAnimations(page);
    const editRow = await smallTargets(page);
    if (editRow.length) failures.push(`#/verlauf (Bearbeiten-Zeile): ${editRow.join(' | ')}`);
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(editCategory).toHaveCount(0);
  }
  const activityTab = page.getByRole('button', { name: 'Aktivität', exact: true });
  await activityTab.click();
  await expect(activityTab).toHaveAttribute('aria-pressed', 'true');
  await waitForAnimations(page);
  const activity = await smallTargets(page);
  if (activity.length) failures.push(`#/verlauf (Aktivität): ${activity.join(' | ')}`);
  await page.getByRole('button', { name: 'Einträge', exact: true }).click();

  await check('#/planung', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Planung' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Streaming-Abo A/ })).toBeVisible();
  });
  await check('#/planung/projektion', async () => {
    await expect(page.getByRole('link', { name: 'Projektion', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('slider', { name: /Lebensmittel/ })).toBeVisible();
  });
  // Formulare mit der Wiederholung als SelectField (`plain`).
  await check('#/einnahme/neu', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Neue Einnahme' })).toBeVisible();
    await expect(page.getByLabel('Wiederholung')).toBeVisible();
  });
  await check('#/fixkosten/neu', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Neue Fixkosten' })).toBeVisible();
    await expect(page.getByLabel('Wiederholung')).toBeVisible();
  });
  await check('#/einstellungen', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
  });
  await check('#/erfassen', async () => {
    await expect(page.getByRole('heading', { name: 'Neue Ausgabe' })).toBeVisible();
  });
  await check('#/budgets', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeVisible();
  });
  await check('#/kategorien', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Kategorien' })).toBeVisible();
  });
  await check(`#/eintrag/${entryId}`, async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Eintrag' })).toBeVisible();
    await expect(page.getByText('Supermarkt A', { exact: true })).toBeVisible();
  });
  await check(`#/ziel/${goalId}`, async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Sparziel A' })).toBeVisible();
  });

  // Übersicht zuletzt: der Konflikt-Banner (Einstieg in den Konflikt-Dialog) gehört dazu.
  await seedConflict(page, entryId);
  await check('#/', async () => {
    await expect(page.getByRole('region', { name: 'Konflikte' })).toBeVisible();
  });

  expect(failures).toEqual([]);
});

/* ---------- Coach-Mark und Tabbar ---------- */

for (const width of [320, 390]) {
  test(`Coach-Mark überlappt die Tabbar nicht (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await start(page);
    const mark = page.getByRole('note');
    await expect(mark).toBeVisible();
    const bar = page.getByRole('navigation', { name: 'Hauptnavigation' });
    const [m, b] = await Promise.all([mark.boundingBox(), bar.boundingBox()]);
    expect(m).not.toBeNull();
    expect(b).not.toBeNull();
    if (!m || !b) return;
    // Die Marke endet oberhalb der Tabbar (der Pfeil liegt im Abstand dazwischen).
    expect(m.y + m.height).toBeLessThanOrEqual(b.y);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(width);
  });
}

/* ---------- Reduced Motion ---------- */

/** Übersicht mit Budget, einem fälligen Fixkostenposten und einer Ausgabe; öffnet das Buchen-Sheet. */
async function openDueSheet(page: Page) {
  await start(page);
  await seed(page, 'budget', { month: today, limit: 10000 });
  await seed(page, 'fixed', {
    name: 'Streaming-Abo A',
    amountMinor: 1500,
    currency: 'CAD',
    isSaving: false,
    autobook: false,
    unit: 'month',
    every: 1,
    startsOn: today,
  });
  await seedEntry(page);
  await go(page, '#/');
  await waitForAnimations(page);
  await page.getByRole('button', { name: /Streaming-Abo A/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Anzahl der Animationen mit echter Dauer (> 1 ms); die globale Regel in base.css setzt sie auf 0,001 ms. */
const animatedCount = (page: Page) =>
  page.evaluate(
    () =>
      document.getAnimations().filter((a) => {
        const d = a.effect?.getComputedTiming().duration;
        return typeof d === 'number' && d > 1;
      }).length,
  );

test('Reduced Motion: keine Animationen auf Übersicht, Projektion und im Sheet', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDueSheet(page);
  await go(page, '#/planung/projektion');
  await expect(page.getByRole('link', { name: 'Projektion', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await waitForAnimations(page);
  expect(await animatedCount(page)).toBe(0);

  await go(page, '#/');
  await expect(overviewHeading(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Streaming-Abo A/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await animatedCount(page)).toBe(0);
});

test('Gegenprobe ohne Reduced Motion: das Sheet animiert beim Öffnen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openDueSheet(page);
  expect(await animatedCount(page)).toBeGreaterThanOrEqual(1);
});
