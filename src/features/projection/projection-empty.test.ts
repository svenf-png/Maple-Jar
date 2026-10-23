import { describe, expect, it } from 'vitest';
import { isProjectionEmpty } from './projection-empty';

const live = { deleted: false };
const gone = { deleted: true };
const none = { incomes: [], fixedCosts: [], entries: [], budgets: [] };

describe('isProjectionEmpty', () => {
  it('ist leer ohne jede Zeile', () => {
    expect(isProjectionEmpty(none)).toBe(true);
  });

  it('ignoriert gelöschte Zeilen', () => {
    expect(
      isProjectionEmpty({ incomes: [gone], fixedCosts: [gone], entries: [gone], budgets: [gone] }),
    ).toBe(true);
  });

  it.each(['incomes', 'fixedCosts', 'entries', 'budgets'] as const)(
    'ist nicht leer mit einer Zeile in %s',
    (key) => {
      expect(isProjectionEmpty({ ...none, [key]: [gone, live] })).toBe(false);
    },
  );
});
