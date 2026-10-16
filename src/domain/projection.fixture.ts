import type { ProjectionInput } from './projection';
import { category, entry, fixedCost, income } from './test-data';

// Gemeinsamer Testfall für Projektion und Szenario: Zeitraum Jan–Apr 2027, heute 14.03.
// Manuelle Ausgaben Jan/Feb/Mar.
export function projectionFixture(over: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    periodStart: '2027-01-01',
    periodEnd: '2027-04-30',
    today: '2027-03-14',
    incomes: [income()],
    fixedCosts: [fixedCost({ id: 'f-rent' })],
    entries: [
      entry({ bookedOn: '2027-01-10', amountMinor: 10_000 }),
      entry({ bookedOn: '2027-02-10', amountMinor: 20_000 }),
      entry({ bookedOn: '2027-03-05', amountMinor: 5_000 }),
    ],
    contributions: [],
    goals: [],
    budgets: [],
    categories: [category()],
    rate: null,
    fixedEntryIds: new Map(),
    coveredUntil: new Map(),
    ...over,
  };
}
