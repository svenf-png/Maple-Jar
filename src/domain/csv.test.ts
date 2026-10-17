import { describe, expect, it } from 'vitest';
import { CSV_BOM, type CsvLabels, csvText, entriesToCsv } from './csv';
import { CAT_A, entry, ME, OTHER } from './test-data';

const labels: CsvLabels = {
  headers: [
    'Datum',
    'Händler',
    'Notiz',
    'Kategorie',
    'Betrag',
    'Währung',
    'Betrag CAD',
    'Bezahlt von',
    'Quelle',
  ],
  source: { manual: 'Manuell', fixed: 'Fixkosten' },
};
const base = {
  categories: [{ id: CAT_A, name: 'Kategorie A' }],
  members: [
    { userId: ME, displayName: 'Person A' },
    { userId: OTHER, displayName: 'Person B' },
  ],
  labels,
};
const HEAD = 'Datum;Händler;Notiz;Kategorie;Betrag;Währung;Betrag CAD;Bezahlt von;Quelle';

describe('entriesToCsv', () => {
  it('leer: BOM und Kopfzeile', () => {
    expect(entriesToCsv({ ...base, entries: [] })).toBe(`${CSV_BOM}${HEAD}\r\n`);
  });
  it('CAD-Eintrag', () => {
    const e = entry({
      bookedOn: '2027-02-03',
      amountMinor: 8417,
      merchant: 'Supermarkt A',
      note: '',
    });
    expect(entriesToCsv({ ...base, entries: [e] })).toBe(
      `${CSV_BOM}${HEAD}\r\n2027-02-03;Supermarkt A;;Kategorie A;84.17;CAD;84.17;Person A;Manuell\r\n`,
    );
  });
  it('EUR mit Kurs 1,5: Betrag und Betrag CAD', () => {
    const e = entry({
      bookedOn: '2027-02-04',
      amountMinor: 1000,
      currency: 'EUR',
      fxRateMicro: 1_500_000,
      merchant: 'Café B',
      paidBy: OTHER,
    });
    expect(entriesToCsv({ ...base, entries: [e] })).toContain(
      '2027-02-04;Café B;;Kategorie A;10.00;EUR;15.00;Person B;Manuell\r\n',
    );
  });
  it('negative Beträge bleiben numerisch, Textzellen werden maskiert', () => {
    const e = entry({ amountMinor: -1250, merchant: '-Erstattung A', note: '@x' });
    expect(entriesToCsv({ ...base, entries: [e] })).toContain(
      ";'-Erstattung A;'@x;Kategorie A;-12.50;CAD;-12.50;",
    );
  });
  it('Fixkosten-Quelle', () => {
    expect(entriesToCsv({ ...base, entries: [entry({ source: 'fixed' })] })).toContain(
      ';Fixkosten\r\n',
    );
  });
  it('gelöschte Einträge fehlen', () => {
    const csv = entriesToCsv({
      ...base,
      entries: [entry({ deleted: true, merchant: 'Weg A' }), entry({ merchant: 'Da A' })],
    });
    expect(csv).toContain('Da A');
    expect(csv).not.toContain('Weg A');
  });
  it('sortiert nach Datum, dann hlc', () => {
    const a = entry({ bookedOn: '2027-03-02', merchant: 'Spät A' });
    const b = entry({ bookedOn: '2027-03-01', merchant: 'Früh A' });
    const lines = entriesToCsv({ ...base, entries: [a, b] }).split('\r\n');
    expect(lines[1]).toContain('Früh A');
    expect(lines[2]).toContain('Spät A');
  });
  it('unbekannte Kategorie und Person ergeben leere Zellen', () => {
    const e = entry({ categoryId: 'x', paidBy: 'y', merchant: 'Laden A' });
    expect(entriesToCsv({ ...base, entries: [e] })).toContain(';Laden A;;;');
  });
});

describe('csvText', () => {
  it.each([
    ['Supermarkt A', 'Supermarkt A'],
    ['Café "B"; Süd', '"Café ""B""; Süd"'],
    ['zwei\nZeilen', '"zwei\nZeilen"'],
    ['=SUM(A1)', "'=SUM(A1)"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@name', "'@name"],
    ['\tTab', "'\tTab"],
    ['\rCR', `"'\rCR"`],
    ['=A;B', `"'=A;B"`],
    ["'=schon", "'=schon"],
    ['', ''],
  ])('%j → %j', (input, out) => expect(csvText(input)).toBe(out));
});
