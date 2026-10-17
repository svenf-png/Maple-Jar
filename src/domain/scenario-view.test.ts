import { describe, expect, it } from 'vitest';
import type { ScenarioExtra } from './model';
import {
  adjustedMonthly,
  type ExtraDraft,
  extraOutsidePeriod,
  isScenarioActive,
  nextMonth,
  sliderCategories,
  toExtra,
  validateExtra,
} from './scenario-view';
import { budget, CAT_A, CAT_B, category } from './test-data';

// Einmalige Ausgabe A (fiktiver Betrag).
const extraExpense: ScenarioExtra = {
  id: '00000000-0000-4000-8000-0000000000e1',
  kind: 'expense',
  name: 'Ausflug A',
  amountMinor: 50000,
  currency: 'CAD',
  on: '2027-05-10',
};

describe('sliderCategories', () => {
  it('nur sichtbare, nicht gelöschte mit Mittelwert oder Budget, nach sort', () => {
    const cats = [
      category({ id: CAT_B, sort: 2 }),
      category({ id: CAT_A, sort: 1 }),
      category({ id: 'x-hidden', hidden: true }),
      category({ id: 'x-deleted', deleted: true }),
      category({ id: 'x-none', sort: 3 }),
    ];
    const averages = new Map([
      [CAT_B, 29000n],
      ['x-hidden', 100n],
      ['x-deleted', 100n],
    ]);
    const budgets = [
      budget({ categoryId: CAT_A, validFrom: '2027-01-01', monthlyLimitCadMinor: 50000 }),
    ];
    expect(sliderCategories(cats, budgets, averages, '2027-02-01').map((c) => c.id)).toEqual([
      CAT_A,
      CAT_B,
    ]);
  });
});
describe('adjustedMonthly', () => {
  it.each([
    [86000n, -20, 68800n],
    [29000n, 5, 30450n],
    [333n, 10, 366n],
    [100n, 0, 100n],
  ])('%s %s → %s', (a, p, r) => expect(adjustedMonthly(a, p)).toBe(r));
});
describe('nextMonth', () => {
  it('Monatserster des Folgemonats', () => {
    expect(nextMonth('2027-02-18')).toBe('2027-03-01');
    expect(nextMonth('2027-12-31')).toBe('2028-01-01');
  });
});
describe('isScenarioActive', () => {
  it('aktiv bei Regler ≠ 0 oder Extras', () => {
    expect(isScenarioActive(null)).toBe(false);
    expect(isScenarioActive({ categoryPct: {}, extras: [] })).toBe(false);
    expect(isScenarioActive({ categoryPct: { [CAT_A]: 0 }, extras: [] })).toBe(false);
    expect(isScenarioActive({ categoryPct: { [CAT_A]: -20 }, extras: [] })).toBe(true);
    expect(isScenarioActive({ categoryPct: {}, extras: [extraExpense] })).toBe(true);
  });
});
describe('extraOutsidePeriod', () => {
  const p = ['2027-01-01', '2027-12-31', '2027-02-18'] as const;
  it('Ausgabe: nach heute und im Zeitraum zählt', () => {
    expect(extraOutsidePeriod(extraExpense, ...p)).toBe(false);
    expect(extraOutsidePeriod({ ...extraExpense, on: '2027-02-18' }, ...p)).toBe(true);
    expect(extraOutsidePeriod({ ...extraExpense, on: '2028-01-02' }, ...p)).toBe(true);
  });
  it('Ziel: außerhalb, wenn alle Monate vor dem laufenden oder nach dem Zeitraum liegen', () => {
    const g = {
      ...extraExpense,
      kind: 'goal' as const,
      on: '2026-10-01',
      targetDate: '2027-01-15',
    };
    expect(extraOutsidePeriod(g, ...p)).toBe(true); // Monate Okt–Dez 2026
    expect(extraOutsidePeriod({ ...g, targetDate: '2027-04-01' }, ...p)).toBe(false);
    expect(extraOutsidePeriod({ ...g, on: '2028-02-01', targetDate: '2028-05-01' }, ...p)).toBe(
      true,
    );
  });
});
describe('validateExtra / toExtra', () => {
  const ok: ExtraDraft = {
    kind: 'expense',
    name: ' Ausflug A ',
    amountMinor: 50000,
    currency: 'CAD',
    on: '2027-05-10',
    targetDate: '',
  };
  it('erster Fehler', () => {
    expect(validateExtra(ok)).toBeNull();
    expect(validateExtra({ ...ok, name: '  ' })).toBe('name');
    expect(validateExtra({ ...ok, name: 'x'.repeat(81) })).toBe('name');
    expect(validateExtra({ ...ok, amountMinor: null })).toBe('amount');
    expect(validateExtra({ ...ok, amountMinor: 0 })).toBe('amount');
    expect(validateExtra({ ...ok, on: '' })).toBe('on');
    expect(validateExtra({ ...ok, kind: 'goal', targetDate: '2027-05-10' })).toBe('targetDate');
    expect(validateExtra({ ...ok, kind: 'goal', targetDate: '2027-09-01' })).toBeNull();
  });
  it('Ausgabe ohne targetDate, Name getrimmt', () => {
    expect(toExtra(ok, 'id-1')).toEqual({
      id: 'id-1',
      kind: 'expense',
      name: 'Ausflug A',
      amountMinor: 50000,
      currency: 'CAD',
      on: '2027-05-10',
    });
    expect(toExtra({ ...ok, kind: 'goal', targetDate: '2027-09-01' }, 'id-2').targetDate).toBe(
      '2027-09-01',
    );
  });
});
