import { describe, expect, it } from 'vitest';
import type { ScenarioExtra } from './model';
import { projectionFixture } from './projection.fixture';
import { compareScenario, scenarioAdjust, scenarioBudgets } from './scenario';
import { budget, CAT_A, CAT_B, category } from './test-data';

const X1 = '00000000-0000-4000-8000-0000000000e1';
const X2 = '00000000-0000-4000-8000-0000000000e2';
const goalX = (over: Partial<ScenarioExtra> = {}): ScenarioExtra => ({
  id: X1,
  kind: 'goal',
  name: 'Ziel A',
  amountMinor: 120_000,
  currency: 'CAD',
  on: '2027-03-10',
  targetDate: '2027-06-10',
  ...over,
});
const expenseX = (over: Partial<ScenarioExtra> = {}): ScenarioExtra => ({
  id: X2,
  kind: 'expense',
  name: 'Ausgabe A',
  amountMinor: 50_000,
  currency: 'CAD',
  on: '2027-04-20',
  ...over,
});

describe('scenarioAdjust', () => {
  it('verteilt ein neues Ziel gleichmäßig auf die Monate', () => {
    const { adjust } = scenarioAdjust({ categoryPct: {}, extras: [goalX()] }, '2027-03-01', null);
    expect([...adjust.extraSaving]).toEqual([
      ['2027-03-01', 40_000n],
      ['2027-04-01', 40_000n],
      ['2027-05-01', 40_000n],
    ]);
  });

  it('verteilt den Rest auf die ersten Monate, die Summe bleibt exakt', () => {
    const { adjust } = scenarioAdjust(
      { categoryPct: {}, extras: [goalX({ amountMinor: 100_001 })] },
      '2027-03-01',
      null,
    );
    expect([...adjust.extraSaving.values()]).toEqual([33_334n, 33_334n, 33_333n]);
  });

  it('zählt Zielraten nur ab dem laufenden Monat', () => {
    const { adjust } = scenarioAdjust({ categoryPct: {}, extras: [goalX()] }, '2027-04-02', null);
    expect([...adjust.extraSaving.keys()]).toEqual(['2027-04-01', '2027-05-01']);
  });

  it('Einmalausgabe zählt nur, wenn sie nach heute liegt', () => {
    expect(
      scenarioAdjust(
        { categoryPct: {}, extras: [expenseX()] },
        '2027-04-19',
        null,
      ).adjust.extraVariable.get('2027-04-01'),
    ).toBe(50_000n);
    expect(
      scenarioAdjust({ categoryPct: {}, extras: [expenseX()] }, '2027-04-20', null).adjust
        .extraVariable.size,
    ).toBe(0);
  });

  it('rechnet EUR-Extras mit Kurs um und markiert approximate', () => {
    const rate = { rateMicro: 1_500_000n, date: '2027-04-01', stale: false };
    const r = scenarioAdjust(
      { categoryPct: {}, extras: [expenseX({ currency: 'EUR' })] },
      '2027-04-01',
      rate,
    );
    expect(r.adjust.extraVariable.get('2027-04-01')).toBe(75_000n);
    expect(r.approximate).toBe(true);
    expect(
      scenarioAdjust(
        { categoryPct: {}, extras: [expenseX({ currency: 'EUR' })] },
        '2027-04-01',
        null,
      ).adjust.extraVariable.get('2027-04-01') ?? 0n,
    ).toBe(0n);
  });

  it('reicht categoryPct unverändert durch', () => {
    const { adjust } = scenarioAdjust(
      { categoryPct: { [CAT_A]: -20 }, extras: [] },
      '2027-03-01',
      null,
    );
    expect(adjust.categoryPct).toEqual({ [CAT_A]: -20 });
  });
});

describe('compareScenario', () => {
  it('vergleicht Basis und Szenario am Zeitraumende', () => {
    const cmp = compareScenario(projectionFixture(), { categoryPct: { [CAT_A]: -20 }, extras: [] });
    // April 3 000 (15 000 − 12 000) + März 1 645 (8 226 − 6 581)
    expect(cmp.diffEndCadMinor).toBe(4_645n);
    expect(cmp.base.endCadMinor).toBe(661_774n);
    expect(cmp.scenario.endCadMinor).toBe(666_419n);
    expect(cmp.scenario.approximate).toBe(false);
  });
});

describe('scenarioBudgets', () => {
  it('schlägt Budgets ab dem nächsten Monat vor, auf ganze Einheiten gerundet', () => {
    const props = scenarioBudgets({
      categories: [
        category(),
        category({ id: CAT_B, sort: 1 }),
        category({ id: 'c-del', deleted: true, sort: 2 }),
      ],
      budgets: [budget()], // CAT_A 100 000 ab 2027-01-01
      averages: new Map([[CAT_B, 15_050n]]),
      categoryPct: { [CAT_A]: -20, [CAT_B]: 10, 'c-del': 10 },
      month: '2027-04-01',
    });
    expect(props).toEqual([
      { categoryId: CAT_A, fromMinor: 100_000n, toMinor: 80_000n },
      { categoryId: CAT_B, fromMinor: 15_050n, toMinor: 16_600n },
    ]);
  });

  it('überspringt Kategorien mit 0 % oder ohne Basis', () => {
    const props = scenarioBudgets({
      categories: [category(), category({ id: CAT_B, sort: 1 })],
      budgets: [],
      averages: new Map(),
      categoryPct: { [CAT_A]: 0, [CAT_B]: 10 },
      month: '2027-04-01',
    });
    expect(props).toEqual([]);
  });
});
