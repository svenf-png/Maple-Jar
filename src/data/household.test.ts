import { describe, expect, it } from 'vitest';
import { findMember, normalizeUsername, periodEndFor } from './household';
import { householdSchema } from './household-schema';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';

const valid = () => ({
  formatVersion: 1,
  householdId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2027-01-01T00:00:00.000Z',
  settings: {
    name: 'Testhaushalt',
    placeLabel: null,
    periodStart: '2027-01-01',
    periodEnd: '2027-12-31',
    baseCurrency: 'CAD',
    secondCurrency: 'EUR',
    fxProvider: 'ECB',
  },
  members: [
    {
      userId: A,
      username: 'person-a',
      displayName: 'Person A',
      color: '#2C6CB0',
      locale: 'de-DE',
      theme: 'auto',
    },
    {
      userId: B,
      username: 'person-b',
      displayName: 'Person B',
      color: '#A2456E',
      locale: 'en-CA',
      theme: 'dark',
    },
  ],
});

describe('householdSchema', () => {
  it('accepts a valid household', () => {
    expect(householdSchema.safeParse(valid()).success).toBe(true);
  });

  it('rejects more than two members', () => {
    const h = valid();
    h.members.push({ ...h.members[0], userId: '00000000-0000-4000-8000-0000000000c1' } as never);
    expect(householdSchema.safeParse(h).success).toBe(false);
  });

  it('rejects unknown fields and wrong currencies', () => {
    expect(householdSchema.safeParse({ ...valid(), extra: 1 }).success).toBe(false);
    const h = valid();
    (h.settings as { baseCurrency: string }).baseCurrency = 'USD';
    expect(householdSchema.safeParse(h).success).toBe(false);
  });

  it('rejects a period start that is not the first of a month', () => {
    const h = valid();
    h.settings.periodStart = '2027-01-15';
    expect(householdSchema.safeParse(h).success).toBe(false);
  });
});

describe('findMember', () => {
  it('finds by user id', () => {
    const h = householdSchema.parse(valid());
    expect(findMember(h, B)?.displayName).toBe('Person B');
    expect(findMember(h, 'nope')).toBeUndefined();
  });
});

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Person-A ')).toBe('person-a');
  });
  it('rejects other characters', () => {
    expect(normalizeUsername('person a')).toBeNull();
    expect(normalizeUsername('p@x')).toBeNull();
    expect(normalizeUsername('')).toBeNull();
  });
});

describe('periodEndFor', () => {
  it('returns the last day of the last month', () => {
    expect(periodEndFor('2027-01-01', 12)).toBe('2027-12-31');
    expect(periodEndFor('2027-03-01', 12)).toBe('2028-02-29');
    expect(periodEndFor('2027-03-01', 1)).toBe('2027-03-31');
  });
});
