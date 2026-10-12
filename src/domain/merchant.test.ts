import { describe, expect, it } from 'vitest';
import { normalizeMerchant, suggestCategory, suggestMerchants } from './merchant';
import { CAT_A, CAT_B, entry } from './test-data';

describe('normalizeMerchant', () => {
  it('ignoriert Groß-/Kleinschreibung, Akzente, Satzzeichen und Leerraum', () => {
    expect(normalizeMerchant('  Café   B! ')).toBe('cafe b');
    expect(normalizeMerchant('SUPERMARKT-A')).toBe('supermarkt a');
    expect(normalizeMerchant('')).toBe('');
  });
});

describe('suggestCategory', () => {
  const entries = [
    entry({ merchant: 'Supermarkt A', categoryId: CAT_A }),
    entry({ merchant: 'supermarkt a', categoryId: CAT_A }),
    entry({ merchant: 'Supermarkt A', categoryId: CAT_B }),
    entry({ merchant: 'Café B', categoryId: CAT_B, deleted: true }),
  ];

  it('liefert die häufigste Kategorie und die Anzahl früherer Einkäufe', () => {
    expect(suggestCategory(entries, 'SUPERMARKT A')).toEqual({ categoryId: CAT_A, count: 3 });
  });

  it('kein Vorschlag bei unbekanntem Händler, leerer Eingabe oder nur gelöschten Einträgen', () => {
    expect(suggestCategory(entries, 'Unbekannt')).toBeNull();
    expect(suggestCategory(entries, '')).toBeNull();
    expect(suggestCategory(entries, 'Café B')).toBeNull();
  });
});

describe('suggestMerchants', () => {
  const entries = [
    entry({ merchant: 'Supermarkt A', bookedOn: '2027-02-01' }),
    entry({ merchant: 'Supermarkt A', bookedOn: '2027-02-05' }),
    entry({ merchant: 'Café B', categoryId: CAT_B }),
    entry({ merchant: 'Bäckerei Süd', categoryId: CAT_B }),
  ];

  it('findet per Präfix und Wortanfang, häufigste zuerst', () => {
    expect(suggestMerchants(entries, 'su').map((s) => s.merchant)).toEqual([
      'Supermarkt A',
      'Bäckerei Süd',
    ]);
    expect(suggestMerchants(entries, 'sud').map((s) => s.merchant)).toEqual(['Bäckerei Süd']);
    expect(suggestMerchants(entries, 'cafe')).toEqual([
      { merchant: 'Café B', categoryId: CAT_B, count: 1 },
    ]);
  });

  it('leere Eingabe und Limit', () => {
    expect(suggestMerchants(entries, '')).toEqual([]);
    expect(suggestMerchants(entries, 's', 1)).toHaveLength(1);
  });

  it('nutzt die zuletzt verwendete Schreibweise', () => {
    const e = [
      entry({ merchant: 'cafe b', bookedOn: '2027-01-01', hlc: 'a' }),
      entry({ merchant: 'Café B', bookedOn: '2027-02-01', hlc: 'b' }),
    ];
    expect(suggestMerchants(e, 'caf')[0]?.merchant).toBe('Café B');
  });
});
