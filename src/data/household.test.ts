import { describe, expect, it } from 'vitest';
import {
  findMember,
  type Household,
  parseHousehold,
  periodEndFor,
  sameLogin,
  serializeHousehold,
} from './household';

const valid = (): Household => ({
  format: 1,
  householdId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2027-01-01T00:00:00.000Z',
  members: [
    { githubLogin: 'person-a', displayName: 'Person A', color: '#2C6CB0' },
    { githubLogin: 'person-b', displayName: 'Person B', color: '#A2456E' },
  ],
  settings: {
    name: 'Testhaushalt',
    placeLabel: null,
    periodStart: '2027-01-01',
    periodEnd: '2027-12-31',
    baseCurrency: 'CAD',
    secondCurrency: 'EUR',
    fxProvider: 'ECB',
  },
});

const parse = (h: unknown) => parseHousehold(JSON.stringify(h));

describe('household.json', () => {
  it('akzeptiert eine gültige Datei (Roundtrip)', () => {
    expect(parseHousehold(serializeHousehold(valid()))).toEqual(valid());
  });

  it('akzeptiert ein einzelnes Mitglied', () => {
    const h = valid();
    h.members = [h.members[0] as Household['members'][number]];
    expect(parse(h)).not.toBeNull();
  });

  it('lehnt 0 und 3 Mitglieder ab', () => {
    const none = { ...valid(), members: [] };
    const three = valid();
    three.members.push({ githubLogin: 'person-c', displayName: 'Person C', color: '#13857A' });
    expect(parse(none)).toBeNull();
    expect(parse(three)).toBeNull();
  });

  it('lehnt Farben außerhalb der Palette ab', () => {
    const h = valid();
    (h.members[0] as { color: string }).color = '#123456';
    expect(parse(h)).toBeNull();
  });

  it('verlangt periodEnd > periodStart', () => {
    const h = valid();
    h.settings.periodEnd = '2027-01-01';
    expect(parse(h)).toBeNull();
  });

  it('verlangt periodStart auf dem Monatsersten', () => {
    const h = valid();
    h.settings.periodStart = '2027-01-15';
    expect(parse(h)).toBeNull();
  });

  it('lehnt doppelte Logins (ohne Groß/Klein) ab', () => {
    const h = valid();
    (h.members[1] as { githubLogin: string }).githubLogin = 'PERSON-A';
    expect(parse(h)).toBeNull();
  });

  it('lehnt falsche Format-Version, Währungen und kaputtes JSON ab', () => {
    expect(parse({ ...valid(), format: 2 })).toBeNull();
    const h = valid();
    (h.settings as { baseCurrency: string }).baseCurrency = 'USD';
    expect(parse(h)).toBeNull();
    expect(parseHousehold('{kaputt')).toBeNull();
  });

  it('vergleicht Logins ohne Groß/Klein', () => {
    expect(sameLogin('Person-A', 'person-a')).toBe(true);
    expect(findMember(valid(), 'PERSON-B')?.displayName).toBe('Person B');
    expect(findMember(valid(), 'person-x')).toBeUndefined();
  });

  it('berechnet das Periodenende', () => {
    expect(periodEndFor('2027-01-01', 12)).toBe('2027-12-31');
    expect(periodEndFor('2027-03-01', 12)).toBe('2028-02-29');
    expect(periodEndFor('2027-11-01', 1)).toBe('2027-11-30');
  });
});
