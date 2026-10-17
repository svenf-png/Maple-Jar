import { describe, expect, it } from 'vitest';
import {
  filterEntries,
  groupByDay,
  type HistoryFilter,
  previousMonth,
  sortEntries,
} from './history';
import { CAT_A, CAT_B, category, entry, ME, OTHER } from './test-data';

const cats = [category({ id: CAT_A, name: 'Lebensmittel' }), category({ id: CAT_B, name: 'Café' })];
const base: HistoryFilter = { query: '', categoryId: null, personId: null, period: 'all' };

describe('previousMonth', () => {
  it('geht über Jahreswechsel', () => {
    expect(previousMonth('2027-03-01')).toBe('2027-02-01');
    expect(previousMonth('2027-01-01')).toBe('2026-12-01');
  });
});

describe('filterEntries', () => {
  const entries = [
    entry({ merchant: 'Supermarkt A', amountMinor: 8417, bookedOn: '2027-02-18', paidBy: ME }),
    entry({
      merchant: 'Café B',
      amountMinor: 945,
      bookedOn: '2027-02-17',
      categoryId: CAT_B,
      paidBy: OTHER,
      note: 'Frühstück',
    }),
    entry({ merchant: 'Supermarkt A', amountMinor: 3000, bookedOn: '2027-01-30' }),
    entry({ merchant: 'Gelöscht', deleted: true, bookedOn: '2027-02-18' }),
    entry({
      merchant: 'Euro-Laden',
      amountMinor: 1000,
      currency: 'EUR',
      fxRateMicro: 1_500_000,
      bookedOn: '2027-02-10',
    }),
  ];
  const run = (f: Partial<HistoryFilter>) =>
    filterEntries(entries, cats, { ...base, ...f }, '2027-02-18').map((e) => e.merchant);

  it('schließt Gelöschtes immer aus', () => {
    expect(run({})).not.toContain('Gelöscht');
  });

  it('Zeitraum: dieser Monat, letzter Monat, gesamt', () => {
    expect(run({ period: 'month' })).toEqual(['Supermarkt A', 'Café B', 'Euro-Laden']);
    expect(run({ period: 'last' })).toEqual(['Supermarkt A']);
    expect(run({ period: 'all' })).toHaveLength(4);
  });

  it('Kategorie und Person', () => {
    expect(run({ categoryId: CAT_B })).toEqual(['Café B']);
    expect(run({ personId: OTHER })).toEqual(['Café B']);
  });

  it('Suche in Händler, Notiz, Kategorie (ohne Akzente) und Betrag', () => {
    expect(run({ query: 'supermarkt' })).toEqual(['Supermarkt A', 'Supermarkt A']);
    expect(run({ query: 'fruhstuck' })).toEqual(['Café B']);
    expect(run({ query: 'cafe' })).toEqual(['Café B']);
    expect(run({ query: '84,17' })).toEqual(['Supermarkt A']);
    expect(run({ query: '84.17' })).toEqual(['Supermarkt A']);
    expect(run({ query: '15' })).toEqual(['Euro-Laden']); // 10 € = 15,00 CA$
    expect(run({ query: 'gibtesnicht' })).toEqual([]);
  });
});

describe('groupByDay', () => {
  it('gruppiert, summiert in CAD und sortiert neueste zuerst', () => {
    const groups = groupByDay([
      entry({ bookedOn: '2027-02-17', amountMinor: 500, hlc: 'a' }),
      entry({ bookedOn: '2027-02-18', amountMinor: 1000, hlc: 'b' }),
      entry({ bookedOn: '2027-02-18', amountMinor: 2000, hlc: 'c' }),
      entry({
        bookedOn: '2027-02-18',
        amountMinor: 1000,
        currency: 'EUR',
        fxRateMicro: 1_500_000,
        hlc: 'd',
      }),
    ]);
    expect(groups.map((g) => g.day)).toEqual(['2027-02-18', '2027-02-17']);
    expect(groups[0]?.total).toBe(4500n);
    expect(groups[0]?.entries.map((e) => e.hlc)).toEqual(['d', 'c', 'b']);
  });
});

describe('sortEntries', () => {
  const a = entry({ id: 'a', bookedOn: '2027-02-10', merchant: 'Supermarkt A', amountMinor: 8417 });
  const b = entry({
    id: 'b',
    hlc: '2',
    bookedOn: '2027-02-12',
    merchant: 'café B',
    amountMinor: 945,
  });
  const c = entry({
    id: 'c',
    hlc: '1',
    bookedOn: '2027-02-12',
    merchant: '',
    note: 'Bäckerei C',
    amountMinor: 2360,
  });
  it('Datum absteigend, gleiches Datum nach hlc absteigend (nicht nach id)', () =>
    expect(sortEntries([a, b, c], 'date', 'desc', 'de-DE').map((e) => e.id)).toEqual([
      'b',
      'c',
      'a',
    ]));
  it('Händler, sonst Notiz, sonst Kategoriename als Sortierschlüssel', () => {
    const noName = entry({
      id: 'x',
      bookedOn: '2027-02-11',
      merchant: '',
      note: '',
      categoryId: CAT_A,
      amountMinor: 100,
    });
    const categoryName = (id: string) => (id === CAT_A ? 'Lebensmittel' : '');
    expect(
      sortEntries([a, b, c, noName], 'merchant', 'asc', 'de-DE', categoryName).map((e) => e.id),
    ).toEqual(['c', 'b', 'x', 'a']);
  });
  it('Händler (sonst Notiz) aufsteigend, ohne Groß/Klein', () =>
    expect(sortEntries([a, b, c], 'merchant', 'asc', 'de-DE').map((e) => e.id)).toEqual([
      'c',
      'b',
      'a',
    ]));
  it('Betrag in CAD aufsteigend', () =>
    expect(sortEntries([a, b, c], 'amount', 'asc', 'de-DE').map((e) => e.id)).toEqual([
      'b',
      'c',
      'a',
    ]));
  it('ändert die Eingabe nicht', () => {
    const list = [a, b, c];
    sortEntries(list, 'amount', 'asc', 'de-DE');
    expect(list.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
