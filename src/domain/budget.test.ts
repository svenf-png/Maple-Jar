import { describe, expect, it } from 'vitest';
import { budgetStatus, daysLeftInMonth, limitFor, monthSummary, spentIn } from './budget';
import { budget, CAT_A, CAT_B, category, entry } from './test-data';

describe('budgetStatus', () => {
  it('kein Limit → none', () => {
    expect(budgetStatus(500n, 0n).state).toBe('none');
  });

  it('unter 80 % → ok, ab 80 % → near, über 100 % → over', () => {
    expect(budgetStatus(7_999n, 10_000n)).toMatchObject({ state: 'ok', pct: 79 });
    expect(budgetStatus(8_000n, 10_000n)).toMatchObject({ state: 'near', pct: 80 });
    expect(budgetStatus(10_000n, 10_000n)).toMatchObject({ state: 'near', pct: 100, overBy: 0n });
    expect(budgetStatus(10_001n, 10_000n)).toMatchObject({ state: 'over', overBy: 1n });
    expect(budgetStatus(17_280n, 15_000n)).toMatchObject({
      state: 'over',
      pct: 115,
      overBy: 2_280n,
    });
  });

  it('rechnet mit großen Beträgen exakt', () => {
    expect(budgetStatus(999_999_999_999n, 1_000_000_000_000n).pct).toBe(99);
  });
});

describe('limitFor', () => {
  it('nimmt den jüngsten Eintrag mit validFrom ≤ Monat', () => {
    const budgets = [
      budget({ validFrom: '2027-01-01', monthlyLimitCadMinor: 100 }),
      budget({ validFrom: '2027-03-01', monthlyLimitCadMinor: 300 }),
    ];
    expect(limitFor(budgets, CAT_A, '2027-02-01')?.monthlyLimitCadMinor).toBe(100);
    expect(limitFor(budgets, CAT_A, '2027-03-01')?.monthlyLimitCadMinor).toBe(300);
    expect(limitFor(budgets, CAT_A, '2026-12-01')).toBeNull();
    expect(limitFor(budgets, CAT_B, '2027-03-01')).toBeNull();
  });

  it('ignoriert gelöschte Einträge und löst Gleichstand per HLC', () => {
    const a = budget({ validFrom: '2027-01-01', monthlyLimitCadMinor: 1, hlc: 'a' });
    const b = budget({ validFrom: '2027-01-01', monthlyLimitCadMinor: 2, hlc: 'b' });
    const gone = budget({ validFrom: '2027-02-01', monthlyLimitCadMinor: 9, deleted: true });
    expect(limitFor([a, b, gone], CAT_A, '2027-02-01')?.monthlyLimitCadMinor).toBe(2);
  });
});

describe('spentIn', () => {
  it('summiert CAD-Beträge des Monats, rechnet EUR um, ignoriert Gelöschtes und andere Monate', () => {
    const entries = [
      entry({ amountMinor: 1000 }),
      entry({ amountMinor: 1000, currency: 'EUR', fxRateMicro: 1_500_000 }),
      entry({ amountMinor: 500, deleted: true }),
      entry({ amountMinor: 700, bookedOn: '2027-03-01' }),
      entry({ amountMinor: 200, categoryId: CAT_B }),
    ];
    expect(spentIn(entries, '2027-02-01')).toBe(2700n);
    expect(spentIn(entries, '2027-02-01', CAT_A)).toBe(2500n);
  });
});

describe('daysLeftInMonth', () => {
  it('zählt den heutigen Tag mit', () => {
    expect(daysLeftInMonth('2027-02-18')).toBe(11);
    expect(daysLeftInMonth('2027-02-28')).toBe(1);
    expect(daysLeftInMonth('2028-02-01')).toBe(29);
  });
});

describe('monthSummary', () => {
  const categories = [
    category({ id: CAT_A, name: 'A', sort: 0 }),
    category({ id: CAT_B, name: 'B', sort: 1 }),
    category({ id: 'c3', name: 'ohne Limit', sort: 2 }),
    category({ id: 'c4', name: 'versteckt', sort: 3, hidden: true }),
  ];
  const budgets = [
    budget({ categoryId: CAT_A, monthlyLimitCadMinor: 10_000 }),
    budget({ categoryId: CAT_B, monthlyLimitCadMinor: 20_000 }),
    budget({ categoryId: 'c4', monthlyLimitCadMinor: 5_000 }),
  ];

  it('berechnet Rest, pro Tag möglich und Zählung nach Status', () => {
    const entries = [
      entry({ amountMinor: 9_000, categoryId: CAT_A }),
      entry({ amountMinor: 2_000, categoryId: CAT_B }),
      entry({ amountMinor: 1_000, categoryId: 'c3' }),
    ];
    const s = monthSummary({
      categories,
      budgets,
      entries,
      month: '2027-02-01',
      today: '2027-02-18',
    });
    expect(s.totalLimit).toBe(35_000n);
    expect(s.totalSpent).toBe(11_000n);
    expect(s.unbudgetedSpent).toBe(1_000n);
    expect(s.remaining).toBe(24_000n);
    expect(s.daysLeft).toBe(11);
    expect(s.perDay).toBe(2_181n);
    expect(s.rows.map((r) => r.category.id)).toEqual([CAT_A, CAT_B]);
    expect(s.attention).toBe(1);
    expect(s.calm).toBe(1);
  });

  it('pro Tag möglich ist bei Überschreitung 0, nie negativ', () => {
    const entries = [entry({ amountMinor: 40_000, categoryId: CAT_A })];
    const s = monthSummary({
      categories,
      budgets,
      entries,
      month: '2027-02-01',
      today: '2027-02-18',
    });
    expect(s.remaining).toBe(-5_000n);
    expect(s.perDay).toBe(0n);
    expect(s.state).toBe('over');
  });

  it('Ausgaben in Kategorien ohne Limit belasten kein Budget', () => {
    const entries = [entry({ amountMinor: 80_000, categoryId: 'c3' })];
    const s = monthSummary({
      categories,
      budgets,
      entries,
      month: '2027-02-01',
      today: '2027-02-18',
    });
    expect(s.totalSpent).toBe(0n);
    expect(s.unbudgetedSpent).toBe(80_000n);
    expect(s.remaining).toBe(35_000n);
    expect(s.state).toBe('ok');
    expect(s.attention).toBe(0);
  });

  it('Gesamtstatus folgt der schlechtesten Kategorie, nicht der Summe', () => {
    // Summe weit unter dem Gesamtlimit, aber A über seinem eigenen Limit.
    const over = monthSummary({
      categories,
      budgets,
      entries: [entry({ amountMinor: 12_000, categoryId: CAT_A })],
      month: '2027-02-01',
      today: '2027-02-18',
    });
    expect(over.remaining).toBe(23_000n);
    expect(over.state).toBe('over');
    // Versteckte Kategorie mit Limit zählt für den Status mit, bekommt aber keine Zeile.
    const hidden = monthSummary({
      categories,
      budgets,
      entries: [entry({ amountMinor: 4_500, categoryId: 'c4' })],
      month: '2027-02-01',
      today: '2027-02-18',
    });
    expect(hidden.rows.map((r) => r.category.id)).toEqual([CAT_A, CAT_B]);
    expect(hidden.state).toBe('near');
  });

  it('ohne Budgets: Summe 0, keine Zeilen', () => {
    const s = monthSummary({
      categories,
      budgets: [],
      entries: [],
      month: '2027-02-01',
      today: '2027-02-18',
    });
    expect(s.rows).toEqual([]);
    expect(s.totalLimit).toBe(0n);
    expect(s.state).toBe('none');
  });

  it('für einen anderen Monat als heute zählt ein Tag', () => {
    const s = monthSummary({
      categories,
      budgets,
      entries: [],
      month: '2027-01-01',
      today: '2027-02-18',
    });
    expect(s.daysLeft).toBe(1);
  });
});
