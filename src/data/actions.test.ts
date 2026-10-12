import { beforeEach, describe, expect, it } from 'vitest';
import { categoryTemplate } from '../domain/category-template';
import {
  applyCategoryTemplate,
  createCategory,
  createEntry,
  deleteEntry,
  NoRateError,
  restoreEntry,
  setBudget,
  updateCategory,
  updateEntry,
} from './actions';
import { MapleJarDb } from './db';

const USER = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b1';
let n = 0;
let db: MapleJarDb;
let cat: string;

beforeEach(async () => {
  db = new MapleJarDb(`actions-test-${++n}`);
  await db.meta.bulkPut([
    { key: 'deviceId', value: '00000000-0000-4000-8000-0000000000d1' },
    { key: 'userId', value: USER },
    {
      key: 'household',
      value: { members: [{ userId: USER }, { userId: OTHER }] },
    },
  ]);
  cat = await createCategory(db, {
    name: ' Lebensmittel ',
    icon: 'lebensmittel',
    color: '#2F7D4F',
    sort: 0,
    hidden: false,
  });
});

const base = () => ({
  amountMinor: 8417,
  currency: 'CAD' as const,
  bookedOn: '2027-02-18',
  categoryId: cat,
  paidBy: USER,
  merchant: ' Supermarkt A ',
  note: '',
  rate: null,
});

describe('createEntry', () => {
  it('legt einen CAD-Eintrag mit Kurs 1 an (Ereignis, Outbox, Zeile)', async () => {
    const id = await createEntry(db, base());
    const row = await db.entry.get(id);
    expect(row).toMatchObject({
      amountMinor: 8417,
      currency: 'CAD',
      fxRateMicro: 1_000_000,
      fxProvisional: false,
      merchant: 'Supermarkt A',
      deleted: false,
    });
    expect(await db.outbox.count()).toBe(2); // Kategorie + Eintrag
  });

  it('EUR mit Tageskurs ist endgültig, mit altem Kurs vorläufig', async () => {
    const a = await createEntry(db, {
      ...base(),
      currency: 'EUR',
      rate: { rateMicro: 1_610_000n, date: '2027-02-18', stale: false },
    });
    const b = await createEntry(db, {
      ...base(),
      currency: 'EUR',
      rate: { rateMicro: 1_600_000n, date: '2027-02-10', stale: true },
    });
    expect(await db.entry.get(a)).toMatchObject({ fxRateMicro: 1_610_000, fxProvisional: false });
    expect(await db.entry.get(b)).toMatchObject({
      fxRateMicro: 1_600_000,
      fxProvisional: true,
      fxRateDate: '2027-02-10',
    });
  });

  it('EUR ohne bekannten Kurs → NoRateError, nichts wird geschrieben', async () => {
    const before = await db.events.count();
    await expect(createEntry(db, { ...base(), currency: 'EUR' })).rejects.toBeInstanceOf(
      NoRateError,
    );
    expect(await db.events.count()).toBe(before);
  });

  it('ungültige Beträge werden abgelehnt', async () => {
    await expect(createEntry(db, { ...base(), amountMinor: 0 })).rejects.toThrow();
  });

  it('Eintrag mit unbekannter Kategorie wartet (kein Zeile)', async () => {
    const id = await createEntry(db, {
      ...base(),
      categoryId: '00000000-0000-4000-8000-0000000000ff',
    });
    expect(await db.entry.get(id)).toBeUndefined();
    expect(((await db.meta.get('waiting'))?.value as string[] | undefined)?.length).toBe(1);
  });
});

describe('updateEntry / delete / restore', () => {
  it('schreibt nur geänderte Felder, ein No-op erzeugt kein Ereignis', async () => {
    const id = await createEntry(db, base());
    const before = await db.events.count();
    expect(await updateEntry(db, id, { amountMinor: 8417, merchant: 'Supermarkt A' })).toBe(false);
    expect(await db.events.count()).toBe(before);
    expect(await updateEntry(db, id, { amountMinor: 9000, note: ' Wocheneinkauf ' })).toBe(true);
    const last = await db.events.orderBy('hlc').last();
    expect(last?.data).toEqual({ amountMinor: 9000, note: 'Wocheneinkauf' });
    expect(await db.entry.get(id)).toMatchObject({ amountMinor: 9000, note: 'Wocheneinkauf' });
  });

  it('Währungswechsel braucht einen Kurs und setzt ihn mit', async () => {
    const id = await createEntry(db, base());
    await expect(updateEntry(db, id, { currency: 'EUR' })).rejects.toBeInstanceOf(NoRateError);
    await updateEntry(db, id, {
      currency: 'EUR',
      rate: { rateMicro: 1_500_000n, date: '2027-02-18', stale: false },
    });
    expect(await db.entry.get(id)).toMatchObject({
      currency: 'EUR',
      fxRateMicro: 1_500_000,
      fxProvisional: false,
    });
  });

  it('Löschen und Wiederherstellen (Rückgängig)', async () => {
    const id = await createEntry(db, base());
    await deleteEntry(db, id);
    expect((await db.entry.get(id))?.deleted).toBe(true);
    await restoreEntry(db, id);
    expect((await db.entry.get(id))?.deleted).toBe(false);
  });

  it('unbekannte ID: updateEntry gibt false zurück', async () => {
    expect(await updateEntry(db, 'nope', { note: 'x' })).toBe(false);
  });
});

describe('Kategorien', () => {
  it('Name wird getrimmt, Updates nur bei Änderung', async () => {
    expect((await db.category.get(cat))?.name).toBe('Lebensmittel');
    expect(await updateCategory(db, cat, { name: 'Lebensmittel' })).toBe(false);
    expect(await updateCategory(db, cat, { name: ' Essen ', hidden: true })).toBe(true);
    expect(await db.category.get(cat)).toMatchObject({ name: 'Essen', hidden: true });
  });

  it('Vorlage legt alle Kategorien in der gewählten Sprache an', async () => {
    await applyCategoryTemplate(db, categoryTemplate, 'en');
    const rows = await db.category.toArray();
    expect(rows).toHaveLength(categoryTemplate.length + 1);
    expect(rows.map((r) => r.name)).toContain('Groceries');
    expect(new Set(rows.map((r) => r.sort)).size).toBe(rows.length);
  });
});

describe('setBudget', () => {
  it('legt an, aktualisiert denselben Monat und lässt frühere Monate unberührt', async () => {
    await setBudget(db, cat, '2027-02-18', 90_000);
    await setBudget(db, cat, '2027-02-01', 95_000);
    await setBudget(db, cat, '2027-03-01', 80_000);
    const rows = (await db.budget.toArray()).sort((a, b) =>
      (a.validFrom as string).localeCompare(b.validFrom as string),
    );
    expect(rows.map((r) => [r.validFrom, r.monthlyLimitCadMinor])).toEqual([
      ['2027-02-01', 95_000],
      ['2027-03-01', 80_000],
    ]);
  });

  it('gleicher Wert erzeugt kein Ereignis', async () => {
    await setBudget(db, cat, '2027-02-01', 90_000);
    const before = await db.events.count();
    await setBudget(db, cat, '2027-02-01', 90_000);
    expect(await db.events.count()).toBe(before);
  });
});
