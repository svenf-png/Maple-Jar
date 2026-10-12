import { describe, expect, it } from 'vitest';
import { fixedCostEntryId, occurrenceIds } from './fixed-cost';
import type { KnownRate } from './fx';
import { type IncomeSplitInput, incomeSplit, percentsOf } from './income-split';
import { budget, CAT_A, CAT_B, contribution, entry, fixedCost, goal, income } from './test-data';

const today = '2027-02-10';
const rate: KnownRate = { rateMicro: 1_500_000n, date: '2027-02-10', stale: false };

async function split(over: Partial<IncomeSplitInput> = {}) {
  const base = {
    incomes: [],
    fixedCosts: [],
    entries: [],
    contributions: [],
    goals: [],
    budgets: [],
    today,
    rate: null,
    ...over,
  };
  const fixedEntryIds = await occurrenceIds(base.fixedCosts, '2027-02-01', today);
  return incomeSplit({ ...base, fixedEntryIds });
}

const amounts = (s: Awaited<ReturnType<typeof split>>) =>
  Object.fromEntries(s.segments.map((x) => [x.kind, x.cadMinor]));
const percentSum = (s: Awaited<ReturnType<typeof split>>) =>
  s.segments.reduce((a, x) => a + x.percent, 0);

describe('percentsOf', () => {
  it('größter Rest, Summe exakt 100', () => {
    expect(percentsOf([1n, 1n, 1n])).toEqual([34, 33, 33]);
    expect(percentsOf([50n, 30n, 20n])).toEqual([50, 30, 20]);
    expect(percentsOf([0n, 0n])).toEqual([0, 0]);
    expect(percentsOf([2n, 1n, 0n]).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('incomeSplit', () => {
  it('Normalfall: Segmente, Frei als Rest, Summe 100', async () => {
    const s = await split({
      incomes: [income({ amountMinor: 300_000, startsOn: '2027-01-01' })],
      budgets: [budget({ categoryId: CAT_A, monthlyLimitCadMinor: 50_000 })],
      entries: [
        entry({ amountMinor: 20_000, categoryId: CAT_A }), // Budget
        entry({ amountMinor: 10_000, categoryId: CAT_B }), // Andere
        entry({ amountMinor: 5_000, categoryId: CAT_A, bookedOn: '2027-01-31' }), // Vormonat
        entry({ amountMinor: 7_000, deleted: true }),
      ],
      fixedCosts: [fixedCost({ amountMinor: 120_000, startsOn: '2027-01-01' })],
      goals: [goal({ id: 'g-x' })],
      contributions: [
        contribution({ goalId: 'g-x', amountMinor: 30_000, contributedOn: '2027-02-05' }),
      ],
    });
    expect(s.mode).toBe('normal');
    expect(s.approximate).toBe(false);
    expect(s.totalCadMinor).toBe(300_000n);
    expect(amounts(s)).toEqual({
      fixed: 120_000n,
      budget: 20_000n,
      other: 10_000n,
      saving: 30_000n,
      free: 120_000n,
    });
    expect(s.segments.map((x) => x.percent)).toEqual([40, 7, 3, 10, 40]);
    expect(percentSum(s)).toBe(100);
  });

  it('Budget-Zuordnung nutzt das Limit des Monats (Limit 0 = ohne Budget)', async () => {
    const s = await split({
      incomes: [income({ amountMinor: 100_000 })],
      budgets: [
        budget({ categoryId: CAT_A, validFrom: '2027-01-01', monthlyLimitCadMinor: 5_000 }),
        budget({ categoryId: CAT_A, validFrom: '2027-02-01', monthlyLimitCadMinor: 0 }),
      ],
      entries: [entry({ amountMinor: 1_000, categoryId: CAT_A })],
    });
    expect(amounts(s).budget).toBe(0n);
    expect(amounts(s).other).toBe(1_000n);
  });

  it('keine Einnahmen: Kreis = Ausgaben, Modus noIncome, ohne Frei', async () => {
    const s = await split({
      entries: [entry({ amountMinor: 3_000 }), entry({ amountMinor: 1_000, categoryId: CAT_B })],
    });
    expect(s.mode).toBe('noIncome');
    expect(s.totalCadMinor).toBe(4_000n);
    expect(s.segments.map((x) => x.kind)).toEqual(['fixed', 'budget', 'other', 'saving']);
    expect(percentSum(s)).toBe(100);
  });

  it('keine Einnahmen und keine Ausgaben: Gesamt 0, Prozent 0', async () => {
    const s = await split();
    expect(s.mode).toBe('noIncome');
    expect(s.totalCadMinor).toBe(0n);
    expect(s.segments.every((x) => x.percent === 0)).toBe(true);
  });

  it('Ausgaben über Einnahmen: Überlauf, Kreis = Ausgaben, Summe 100', async () => {
    const s = await split({
      incomes: [income({ amountMinor: 100_000 })],
      entries: [
        entry({ amountMinor: 90_000, categoryId: CAT_B }),
        entry({ amountMinor: 60_000, categoryId: CAT_B }),
      ],
    });
    expect(s.mode).toBe('overflow');
    expect(s.totalCadMinor).toBe(150_000n);
    expect(s.expensesCadMinor).toBe(150_000n);
    expect(s.incomeCadMinor).toBe(100_000n);
    const a = amounts(s);
    expect(a.other).toBe(150_000n); // wahrer Betrag, keine Skalierung
    expect(s.segments.some((x) => x.kind === 'free')).toBe(false);
    expect(s.segments.some((x) => (x.kind as string) === 'overflow')).toBe(false);
    expect(s.segments.reduce((t, x) => t + x.cadMinor, 0n)).toBe(150_000n);
    expect(percentSum(s)).toBe(100);
    expect(s.overflow).toEqual({ cadMinor: 50_000n, percentOfTotal: 33 });
  });

  it('Überlauf: Prozente der Segmente (größter Rest) summieren auf 100 der Ausgaben', async () => {
    const s = await split({
      incomes: [income({ amountMinor: 10_000 })],
      entries: [
        entry({ amountMinor: 10_000, categoryId: CAT_B }),
        entry({ amountMinor: 10_000, categoryId: CAT_B }),
        entry({ amountMinor: 10_000, categoryId: CAT_B }),
      ],
    });
    expect(s.mode).toBe('overflow');
    expect(percentSum(s)).toBe(100);
    expect(s.overflow?.percentOfTotal).toBe(67);
  });

  it('normal und noIncome haben keinen Überlauf', async () => {
    const s = await split({
      incomes: [income({ amountMinor: 10_000 })],
      entries: [entry({ amountMinor: 1_000, categoryId: CAT_B })],
    });
    expect(s.overflow).toBeNull();
  });

  it('Ausgaben genau gleich Einnahmen: normal, Frei 0', async () => {
    const s = await split({
      incomes: [income({ amountMinor: 10_000 })],
      entries: [entry({ amountMinor: 10_000, categoryId: CAT_B })],
    });
    expect(s.mode).toBe('normal');
    expect(amounts(s).free).toBe(0n);
  });

  it('EUR: Einnahme und Beitrag werden umgerechnet, approximate', async () => {
    const s = await split({
      rate,
      incomes: [income({ amountMinor: 100_000, currency: 'EUR' })], // 150_000 CAD
      goals: [goal({ id: 'g-e', currency: 'EUR' })],
      contributions: [
        contribution({ goalId: 'g-e', amountMinor: 10_000, contributedOn: '2027-02-02' }),
      ], // 15_000
    });
    expect(s.approximate).toBe(true);
    expect(s.totalCadMinor).toBe(150_000n);
    expect(amounts(s).saving).toBe(15_000n);
    expect(amounts(s).free).toBe(135_000n);
  });

  it('EUR ohne Kurs entfällt, nur CAD ist nicht approximate', async () => {
    const s = await split({
      incomes: [income({ currency: 'EUR' }), income({ amountMinor: 5_000 })],
    });
    expect(s.totalCadMinor).toBe(5_000n);
    expect(s.approximate).toBe(false);
  });

  it('gebuchter EUR-Eintrag nutzt den eigenen Kurs und macht nicht approximate', async () => {
    const s = await split({
      incomes: [income({ amountMinor: 100_000 })],
      entries: [
        entry({ amountMinor: 1_000, currency: 'EUR', fxRateMicro: 1_400_000, categoryId: CAT_B }),
      ],
    });
    expect(amounts(s).other).toBe(1_400n);
    expect(s.approximate).toBe(false);
  });

  it('Einnahmen: mehrere Fälligkeiten und once-Korrektur zählen', async () => {
    const s = await split({
      incomes: [
        income({ amountMinor: 1_000, unit: 'week', startsOn: '2027-02-01' }), // 01., 08.
        income({ amountMinor: 500, unit: 'once', startsOn: '2027-02-09' }),
        income({ amountMinor: 700, unit: 'once', startsOn: '2027-02-11' }), // nach heute
        income({ amountMinor: 900, unit: 'once', startsOn: '2027-01-31' }), // Vormonat
        income({ amountMinor: 9_999, deleted: true }),
      ],
    });
    expect(s.incomeCadMinor).toBe(2_500n);
  });

  it('keine Doppelzählung: gebuchte Fixkosten zählen genau einmal', async () => {
    const fc = fixedCost({ id: 'fx-a', amountMinor: 80_000, startsOn: '2027-02-01' });
    const id = await fixedCostEntryId('fx-a', '2027-02-01');
    const booked = entry({
      id,
      amountMinor: 80_000,
      source: 'fixed',
      fixedCostId: 'fx-a',
      bookedOn: '2027-02-01',
      categoryId: CAT_A,
    });
    const s = await split({
      incomes: [income({ amountMinor: 200_000 })],
      fixedCosts: [fc],
      entries: [booked],
      budgets: [budget({ categoryId: CAT_A, monthlyLimitCadMinor: 50_000 })],
    });
    expect(amounts(s).fixed).toBe(80_000n);
    expect(amounts(s).budget).toBe(0n); // zählt nicht zusätzlich als Budget
    expect(amounts(s).other).toBe(0n);
    expect(amounts(s).free).toBe(120_000n);
  });

  it('nicht gebuchte Fälligkeit bis heute zählt, künftige nicht', async () => {
    const s = await split({
      incomes: [income({ amountMinor: 200_000 })],
      fixedCosts: [
        fixedCost({ amountMinor: 10_000, startsOn: '2027-02-10' }), // heute
        fixedCost({ amountMinor: 20_000, startsOn: '2027-02-11' }), // morgen
        fixedCost({ amountMinor: 30_000, startsOn: '2027-01-15' }), // 15.02. noch nicht
      ],
    });
    expect(amounts(s).fixed).toBe(10_000n);
  });

  it('gelöschte Buchung: Fälligkeit zählt weder als Eintrag noch erneut', async () => {
    const fc = fixedCost({ id: 'fx-b', amountMinor: 80_000, startsOn: '2027-02-01' });
    const id = await fixedCostEntryId('fx-b', '2027-02-01');
    const s = await split({
      incomes: [income({ amountMinor: 200_000 })],
      fixedCosts: [fc],
      entries: [
        entry({
          id,
          amountMinor: 80_000,
          source: 'fixed',
          fixedCostId: 'fx-b',
          bookedOn: '2027-02-01',
          deleted: true,
        }),
      ],
    });
    expect(amounts(s).fixed).toBe(0n);
  });

  it('Sparen-Fixkosten (gebucht und fällig) zählen als Sparen, nicht als Fixkosten', async () => {
    const saveBooked = fixedCost({
      id: 'sv-a',
      isSaving: true,
      amountMinor: 20_000,
      startsOn: '2027-02-01',
    });
    const saveDue = fixedCost({
      id: 'sv-b',
      isSaving: true,
      amountMinor: 5_000,
      startsOn: '2027-02-05',
    });
    const idA = await fixedCostEntryId('sv-a', '2027-02-01');
    const s = await split({
      incomes: [income({ amountMinor: 100_000 })],
      fixedCosts: [saveBooked, saveDue],
      entries: [
        entry({
          id: idA,
          amountMinor: 20_000,
          source: 'fixed',
          fixedCostId: 'sv-a',
          bookedOn: '2027-02-01',
        }),
      ],
    });
    expect(amounts(s).saving).toBe(25_000n);
    expect(amounts(s).fixed).toBe(0n);
  });

  it('Beiträge: negative, gelöschte und andere Monate zählen nicht', async () => {
    const s = await split({
      incomes: [income({ amountMinor: 100_000 })],
      goals: [goal({ id: 'g-1' })],
      contributions: [
        contribution({ goalId: 'g-1', amountMinor: 4_000, contributedOn: '2027-02-10' }),
        contribution({ goalId: 'g-1', amountMinor: -1_000, contributedOn: '2027-02-10' }),
        contribution({
          goalId: 'g-1',
          amountMinor: 2_000,
          contributedOn: '2027-02-10',
          deleted: true,
        }),
        contribution({ goalId: 'g-1', amountMinor: 3_000, contributedOn: '2027-01-31' }),
        contribution({ goalId: 'g-1', amountMinor: 6_000, contributedOn: '2027-02-11' }),
      ],
    });
    expect(amounts(s).saving).toBe(4_000n);
  });

  it('Rundung: Prozente summieren sich in jedem Fall auf genau 100', async () => {
    for (const parts of [
      [1, 1, 1],
      [3333, 3333, 3334],
      [1, 2, 4],
      [7, 11, 13],
    ]) {
      const [a = 0, b = 0, c = 0] = parts;
      const s = await split({
        incomes: [income({ amountMinor: 10_007 })],
        budgets: [budget({ categoryId: CAT_A, monthlyLimitCadMinor: 100 })],
        entries: [
          entry({ amountMinor: a, categoryId: CAT_A }),
          entry({ amountMinor: b, categoryId: CAT_B }),
          entry({ amountMinor: c, categoryId: CAT_B }),
        ],
        fixedCosts: [fixedCost({ amountMinor: 3, startsOn: '2027-02-02' })],
      });
      expect(percentSum(s)).toBe(100);
      expect(s.segments.reduce((t, x) => t + x.cadMinor, 0n)).toBe(s.totalCadMinor);
    }
  });
});
