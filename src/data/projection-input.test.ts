import { describe, expect, it } from 'vitest';
import { entry, fixedCost } from '../domain/test-data';
import { buildProjectionInput, type ProjectionRows } from './projection-input';

const emptyRows = (over: Partial<ProjectionRows> = {}): ProjectionRows => ({
  incomes: [],
  fixedCosts: [],
  entries: [],
  contributions: [],
  goals: [],
  budgets: [],
  categories: [],
  ...over,
});

describe('buildProjectionInput', () => {
  it('setzt Zeitraum, heute, Kurs und berechnet die Fälligkeits-IDs über den ganzen Zeitraum', async () => {
    const fc = fixedCost({ startsOn: '2027-01-05' }); // monatlich
    const rows = emptyRows({ fixedCosts: [fc] });
    const input = await buildProjectionInput(
      rows,
      { periodStart: '2027-01-01', periodEnd: '2027-03-31' },
      '2027-02-10',
      null,
    );
    expect(input.periodStart).toBe('2027-01-01');
    expect(input.periodEnd).toBe('2027-03-31');
    expect(input.today).toBe('2027-02-10');
    expect(input.rate).toBeNull();
    expect(input.fixedEntryIds.size).toBe(3); // 5. Jan, Feb, März
    expect(input.coveredUntil.size).toBe(0);
  });

  it('gelöschte Fixkosten fließen nicht in die Abdeckung ein', async () => {
    // Verwaiste Fixkosten-Einträge (ID gehört zu keiner Fälligkeit) decken Fälligkeiten ab.
    // Live-Fixkosten: Abdeckung. Gelöschter Zwilling mit gleichwertigem Eintrag: keine Abdeckung.
    const live = fixedCost({ id: 'fc-live', startsOn: '2027-01-05' });
    const dead = fixedCost({ id: 'fc-dead', startsOn: '2027-01-05', deleted: true });
    const orphan = (id: string, fixedCostId: string) =>
      entry({ id, source: 'fixed', fixedCostId, bookedOn: '2027-01-05' });
    const rows = emptyRows({
      fixedCosts: [live, dead],
      entries: [orphan('orphan-live', 'fc-live'), orphan('orphan-dead', 'fc-dead')],
    });
    const input = await buildProjectionInput(
      rows,
      { periodStart: '2027-01-01', periodEnd: '2027-03-31' },
      '2027-02-10',
      null,
    );
    expect(input.coveredUntil.size).toBe(1);
    expect(input.coveredUntil.get('fc-live')).toBe('2027-01-05');
    expect(input.coveredUntil.has('fc-dead')).toBe(false);
  });
});
