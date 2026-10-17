import { describe, expect, it } from 'vitest';
import { occurrenceKey } from './fixed-cost';
import { projection, variableAverages } from './projection';
import { projectionFixture } from './projection.fixture';
import { budget, CAT_A, contribution, entry, fixedCost, income } from './test-data';

describe('variableAverages', () => {
  it('mittelt die drei Vormonate ab dem ersten manuellen Eintrag', () => {
    const avg = variableAverages(projectionFixture());
    expect(avg.basis).toBe('average');
    expect(avg.byCategory.get(CAT_A)).toBe(15_000n);
  });
});

describe('projection', () => {
  it('rechnet Ist und Prognose pro Monat und kumuliert', () => {
    const p = projection(projectionFixture());
    expect(p.variableBasis).toBe('average');
    expect(p.variableByCategory.get(CAT_A)).toBe(15_000n);
    expect(p.months.map((m) => m.month)).toEqual([
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
      '2027-04-01',
    ]);
    expect(p.months.map((m) => m.kind)).toEqual(['actual', 'actual', 'current', 'forecast']);
    // 5 000 Ist + 15 000 × 17/31 = 8 226
    expect(p.months[0]?.variableCadMinor).toBe(10_000n);
    expect(p.months[0]?.netCadMinor).toBe(170_000n);
    expect(p.months[0]?.cumulativeCadMinor).toBe(170_000n);
    expect(p.months[1]?.variableCadMinor).toBe(20_000n);
    expect(p.months[1]?.netCadMinor).toBe(160_000n);
    expect(p.months[1]?.cumulativeCadMinor).toBe(330_000n);
    expect(p.months[2]?.variableCadMinor).toBe(13_226n);
    expect(p.months[2]?.netCadMinor).toBe(166_774n);
    expect(p.months[2]?.cumulativeCadMinor).toBe(496_774n);
    expect(p.months[3]?.variableCadMinor).toBe(15_000n);
    expect(p.months[3]?.netCadMinor).toBe(165_000n);
    expect(p.months[3]?.cumulativeCadMinor).toBe(661_774n);
    for (const m of p.months) {
      expect(m.incomeCadMinor).toBe(300_000n);
      expect(m.fixedCadMinor).toBe(120_000n);
    }
    expect(p.endCadMinor).toBe(661_774n);
    expect(p.approximate).toBe(false);
  });

  it('zählt eine gebuchte Fälligkeit nur einmal, auch in der Zukunft', () => {
    const jan = entry({
      id: 'e-jan',
      source: 'fixed',
      fixedCostId: 'f-rent',
      amountMinor: 120_000,
      bookedOn: '2027-01-01',
    });
    const apr = entry({
      id: 'e-apr',
      source: 'fixed',
      fixedCostId: 'f-rent',
      amountMinor: 120_000,
      bookedOn: '2027-04-01',
    });
    const p = projection(
      projectionFixture({
        entries: [...projectionFixture().entries, jan, apr],
        fixedEntryIds: new Map([
          [occurrenceKey('f-rent', '2027-01-01'), 'e-jan'],
          [occurrenceKey('f-rent', '2027-04-01'), 'e-apr'],
        ]),
      }),
    );
    for (const m of p.months) expect(m.fixedCadMinor).toBe(120_000n);
    expect(p.variableByCategory.get(CAT_A)).toBe(15_000n);
  });

  it('ein gelöschter gebuchter Eintrag gilt als nicht gebucht', () => {
    const jan = entry({
      id: 'e-jan',
      source: 'fixed',
      fixedCostId: 'f-rent',
      amountMinor: 120_000,
      bookedOn: '2027-01-01',
      deleted: true,
    });
    const p = projection(
      projectionFixture({
        entries: [...projectionFixture().entries, jan],
        fixedEntryIds: new Map([[occurrenceKey('f-rent', '2027-01-01'), 'e-jan']]),
      }),
    );
    expect(p.months[0]?.fixedCadMinor).toBe(120_000n);
  });

  it('Fixkosten mit isSaving und positive Beiträge zählen als Sparen, Entnahmen nicht', () => {
    const p = projection(
      projectionFixture({
        fixedCosts: [
          fixedCost({ id: 'f-rent' }),
          fixedCost({ id: 'f-save', isSaving: true, amountMinor: 20_000 }),
        ],
        contributions: [
          contribution({ contributedOn: '2027-02-10', amountMinor: 10_000 }),
          contribution({ contributedOn: '2027-02-11', amountMinor: -5_000 }),
        ],
      }),
    );
    expect(p.months[0]?.savingCadMinor).toBe(20_000n);
    expect(p.months[1]?.savingCadMinor).toBe(30_000n);
    expect(p.months[2]?.savingCadMinor).toBe(20_000n);
  });

  it('fällt ohne vollständigen Vormonat auf Budgets zurück, ohne Budgets auf none', () => {
    const withBudget = projection(projectionFixture({ today: '2027-01-14', budgets: [budget()] }));
    expect(withBudget.variableBasis).toBe('budget');
    expect(withBudget.variableByCategory.get(CAT_A)).toBe(100_000n);

    const without = projection(projectionFixture({ today: '2027-01-14' }));
    expect(without.variableBasis).toBe('none');
    expect(without.variableByCategory.size).toBe(0);
    // Prognose ohne Mittelwert: nur Ist
    expect(without.months.map((m) => m.variableCadMinor)).toEqual([10_000n, 20_000n, 5_000n, 0n]);
  });

  it('rechnet EUR mit bekanntem Kurs und markiert approximate; ohne Kurs zählt 0', () => {
    const eur = income({ currency: 'EUR', amountMinor: 100_000 });
    const withRate = projection(
      projectionFixture({
        incomes: [eur],
        rate: { rateMicro: 1_500_000n, date: '2027-03-14', stale: false },
      }),
    );
    for (const m of withRate.months) expect(m.incomeCadMinor).toBe(150_000n);
    expect(withRate.approximate).toBe(true);

    const noRate = projection(projectionFixture({ incomes: [eur], rate: null }));
    for (const m of noRate.months) expect(m.incomeCadMinor).toBe(0n);
    expect(noRate.approximate).toBe(true);
  });

  it('Reglerwerte und Extras wirken nur auf die Prognose', () => {
    const p = projection(projectionFixture(), {
      categoryPct: { [CAT_A]: -20 },
      extraVariable: new Map([['2027-04-01', 50_000n]]),
      extraSaving: new Map([['2027-04-01', 7_000n]]),
    });
    // Ist unverändert
    expect(p.months[0]?.variableCadMinor).toBe(10_000n);
    // 5 000 + 15 000 × 80 % × 17/31 = 6 581
    expect(p.months[2]?.variableCadMinor).toBe(11_581n);
    // 12 000 + 50 000
    expect(p.months[3]?.variableCadMinor).toBe(62_000n);
    expect(p.months[3]?.savingCadMinor).toBe(7_000n);
  });

  it('Zeitraum endet mitten im Monat: anteilige Prognose', () => {
    const p = projection(projectionFixture({ periodEnd: '2027-04-15' }));
    expect(p.months[3]?.variableCadMinor).toBe(7_500n);
    expect(p.months[3]?.incomeCadMinor).toBe(300_000n);
    expect(p.months[3]?.fixedCadMinor).toBe(120_000n);
  });

  it('heute vor dem Zeitraum: alles Prognose', () => {
    const p = projection(projectionFixture({ today: '2026-12-20' }));
    expect(p.months.map((m) => m.kind)).toEqual(['forecast', 'forecast', 'forecast', 'forecast']);
  });

  it('heute nach dem Zeitraum: keine Prognose', () => {
    const p = projection(projectionFixture({ today: '2027-06-10' }));
    expect(p.months.map((m) => m.kind)).toEqual(['actual', 'actual', 'actual', 'actual']);
    expect(p.months.map((m) => m.variableCadMinor)).toEqual([10_000n, 20_000n, 5_000n, 0n]);
  });

  it('Fälligkeiten bis coveredUntil zählen nicht (verwaister Eintrag)', () => {
    const p = projection(projectionFixture({ coveredUntil: new Map([['f-rent', '2027-02-01']]) }));
    expect(p.months[0]?.fixedCadMinor).toBe(0n);
    expect(p.months[1]?.fixedCadMinor).toBe(0n);
    expect(p.months[2]?.fixedCadMinor).toBe(120_000n);
    expect(p.months[3]?.fixedCadMinor).toBe(120_000n);
  });

  it('ignoriert gelöschte Zeilen und Einträge außerhalb des Zeitraums', () => {
    // heute nach dem Zeitraum, damit nur das Ist zählt
    const p = projection(
      projectionFixture({
        today: '2027-06-10',
        incomes: [income({ deleted: true })],
        entries: [
          ...projectionFixture().entries,
          entry({ bookedOn: '2026-12-31', amountMinor: 77_000 }),
          entry({ bookedOn: '2027-05-01', amountMinor: 88_000 }),
          entry({ bookedOn: '2027-02-12', amountMinor: 99_000, deleted: true }),
        ],
      }),
    );
    expect(p.months.every((m) => m.incomeCadMinor === 0n)).toBe(true);
    expect(p.months.map((m) => m.variableCadMinor)).toEqual([10_000n, 20_000n, 5_000n, 0n]);
  });
});
