import { afterEach, describe, expect, it } from 'vitest';
import { CSV_BOM, type CsvLabels } from '../domain/csv';
import { CAT_A, ME, OTHER } from '../domain/test-data';
import { MapleJarDb } from './db';
import { exportEntriesCsv } from './export';

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
const members = [
  { userId: ME, displayName: 'Person A' },
  { userId: OTHER, displayName: 'Person B' },
];

const db = new MapleJarDb('csv-test');

afterEach(async () => {
  await db.delete();
  await db.open();
});

describe('exportEntriesCsv', () => {
  it('liefert die Einträge aus der Datenbank, ohne gelöschte', async () => {
    await db.category.put({
      id: CAT_A,
      name: 'Kategorie A',
      icon: 'sonstiges',
      color: '#2C6CB0',
      sort: 0,
      hidden: false,
      deleted: false,
      hlc: 'h1',
      createdBy: ME,
      createdByDevice: 'd1',
      conflict: false,
    });
    await db.entry.bulkPut([
      {
        id: 'e1',
        amountMinor: 8417,
        currency: 'CAD',
        fxRateMicro: 1_000_000,
        fxRateDate: '2027-02-03',
        fxProvisional: false,
        bookedOn: '2027-02-03',
        categoryId: CAT_A,
        paidBy: ME,
        merchant: 'Supermarkt A',
        note: '',
        source: 'manual',
        deleted: false,
        conflict: false,
        hlc: 'h2',
        createdBy: ME,
        createdByDevice: 'd1',
      },
      {
        id: 'e2',
        amountMinor: 500,
        currency: 'CAD',
        fxRateMicro: 1_000_000,
        fxRateDate: '2027-02-04',
        fxProvisional: false,
        bookedOn: '2027-02-04',
        categoryId: CAT_A,
        paidBy: OTHER,
        merchant: 'Weg A',
        note: '',
        source: 'manual',
        deleted: true,
        conflict: false,
        hlc: 'h3',
        createdBy: OTHER,
        createdByDevice: 'd2',
      },
    ]);

    const csv = await exportEntriesCsv(db, members, labels);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('2027-02-03;Supermarkt A;;Kategorie A;84.17;CAD;84.17;Person A;Manuell');
    expect(csv).not.toContain('Weg A');
  });
});
