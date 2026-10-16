import { beforeEach, describe, expect, it } from 'vitest';
import { categoryTemplate } from '../domain/category-template';
import { fixedCostEntryId } from '../domain/fixed-cost';
import { SCENARIO_ID } from '../domain/model';
import {
  addContribution,
  adoptScenarioBudgets,
  applyCategoryTemplate,
  archiveGoal,
  bookFixedCost,
  createCategory,
  createEntry,
  createFixedCost,
  createGoal,
  createIncome,
  deleteContribution,
  deleteEntry,
  deleteFixedCost,
  deleteIncome,
  InvalidPatchError,
  NoHouseholdError,
  NoRateError,
  restoreEntry,
  runAutobook,
  saveScenario,
  setBudget,
  updateCategory,
  updateEntry,
  updateFixedCost,
  updateGoal,
  updateIncome,
} from './actions';
import { MapleJarDb } from './db';
import { getMemberIds, refoldRows, waitingRefs } from './events/apply';
import { appendLocalEvent } from './write';

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

describe('Einnahmen, Fixkosten, Sparziele', () => {
  const rule = { unit: 'month' as const, every: 1, startsOn: '2027-01-01' };
  const goalInput = {
    name: ' Sparziel A ',
    icon: 'reise',
    color: '#2F7D4F',
    targetMinor: 120_000,
    currency: 'CAD' as const,
    startsOn: '2027-01-01',
    targetDate: '2027-12-31',
  };

  it('Einnahme: anlegen (Name getrimmt), nur geänderte Felder, löschen', async () => {
    const id = await createIncome(db, {
      ...rule,
      name: ' Gehalt A ',
      memberId: USER,
      amountMinor: 300_000,
      currency: 'CAD',
    });
    expect((await db.income.get(id))?.name).toBe('Gehalt A');
    const before = await db.events.count();
    expect(await updateIncome(db, id, { name: 'Gehalt A', amountMinor: 310_000 })).toBe(true);
    expect(await db.events.count()).toBe(before + 1);
    expect((await db.events.orderBy('hlc').last())?.data).toEqual({ amountMinor: 310_000 });
    expect(await updateIncome(db, id, { amountMinor: 310_000 })).toBe(false);
    await deleteIncome(db, id);
    expect((await db.income.get(id))?.deleted).toBe(true);
  });

  it('Fixkosten: anlegen, ändern, löschen', async () => {
    const id = await createFixedCost(db, {
      ...rule,
      name: ' Streaming-Abo A ',
      amountMinor: 1299,
      currency: 'CAD',
      categoryId: cat,
      isSaving: false,
      autobook: true,
    });
    expect((await db.fixedCost.get(id))?.name).toBe('Streaming-Abo A');
    expect(await updateFixedCost(db, id, { autobook: false, isSaving: false })).toBe(true);
    expect((await db.events.orderBy('hlc').last())?.data).toEqual({ autobook: false });
    expect((await db.fixedCost.get(id))?.autobook).toBe(false);
    await deleteFixedCost(db, id);
    expect((await db.fixedCost.get(id))?.deleted).toBe(true);
  });

  it('Ziel: anlegen, ändern, archivieren (einmalig)', async () => {
    const id = await createGoal(db, goalInput);
    expect((await db.goal.get(id))?.name).toBe('Sparziel A');
    expect(await updateGoal(db, id, { targetMinor: 130_000 })).toBe(true);
    expect(await updateGoal(db, id, { targetMinor: 130_000 })).toBe(false);
    expect(await archiveGoal(db, id, '2027-06-01')).toBe(true);
    expect((await db.goal.get(id))?.archivedAt).toBe('2027-06-01');
    expect(await archiveGoal(db, id, '2027-07-01')).toBe(false);
    expect((await db.goal.get(id))?.archivedAt).toBe('2027-06-01');
  });

  it('optionale Felder lassen sich mit null löschen (Einnahme, Fixkosten, Ziel)', async () => {
    const inc = await createIncome(db, {
      ...rule,
      endsOn: '2027-12-31',
      name: 'Gehalt A',
      memberId: USER,
      amountMinor: 300_000,
      currency: 'CAD',
    });
    expect(await updateIncome(db, inc, { endsOn: null, memberId: null })).toBe(true);
    expect(await updateIncome(db, inc, { endsOn: null })).toBe(false);
    expect(await db.income.get(inc)).toMatchObject({ endsOn: null, memberId: null });
    const fc = await createFixedCost(db, {
      ...rule,
      endsOn: '2027-12-31',
      icon: 'haus',
      name: 'Miete A',
      amountMinor: 100_000,
      currency: 'CAD',
      categoryId: cat,
      isSaving: false,
      autobook: false,
    });
    expect(await updateFixedCost(db, fc, { endsOn: null, icon: null })).toBe(true);
    expect(await db.fixedCost.get(fc)).toMatchObject({ endsOn: null, icon: null });
    const goal = await createGoal(db, goalInput);
    await archiveGoal(db, goal, '2027-06-01');
    expect(await updateGoal(db, goal, { archivedAt: null })).toBe(true);
    expect((await db.goal.get(goal))?.archivedAt).toBeNull();
    expect(await archiveGoal(db, goal, '2027-07-01')).toBe(true);
    expect((await db.goal.get(goal))?.archivedAt).toBe('2027-07-01');
  });

  it('ungültiger Patch (zusammengeführter Stand verletzt Regeln) wirft und schreibt nichts', async () => {
    const inc = await createIncome(db, {
      ...rule,
      name: 'Gehalt A',
      amountMinor: 1000,
      currency: 'CAD',
    });
    const fc = await createFixedCost(db, {
      ...rule,
      endsOn: '2027-12-31',
      name: 'Miete A',
      amountMinor: 100,
      currency: 'CAD',
      categoryId: cat,
      isSaving: false,
      autobook: false,
    });
    const goal = await createGoal(db, goalInput);
    const before = await db.events.count();
    await expect(updateFixedCost(db, fc, { startsOn: '2028-01-01' })).rejects.toBeInstanceOf(
      InvalidPatchError,
    ); // Start nach Ende
    await expect(updateIncome(db, inc, { unit: 'once', every: 2 })).rejects.toBeInstanceOf(
      InvalidPatchError,
    );
    await expect(updateGoal(db, goal, { targetDate: '2027-01-01' })).rejects.toBeInstanceOf(
      InvalidPatchError,
    ); // Zieldatum nicht nach Start
    expect(await db.events.count()).toBe(before);
    // Ende zugleich löschen macht den Patch gültig
    expect(await updateFixedCost(db, fc, { startsOn: '2028-01-01', endsOn: null })).toBe(true);
  });

  it('Beitrag: anlegen, Entnahme, löschen; ungültiger Betrag wirft', async () => {
    const goal = await createGoal(db, goalInput);
    const id = await addContribution(db, {
      goalId: goal,
      amountMinor: 5000,
      contributedOn: '2027-02-01',
      memberId: USER,
      note: ' Monat ',
    });
    expect((await db.goalContribution.get(id))?.note).toBe('Monat');
    await addContribution(db, {
      goalId: goal,
      amountMinor: -200,
      contributedOn: '2027-02-02',
      note: '',
    });
    await expect(
      addContribution(db, { goalId: goal, amountMinor: 0, contributedOn: '2027-02-02', note: '' }),
    ).rejects.toThrow();
    await deleteContribution(db, id);
    expect((await db.goalContribution.get(id))?.deleted).toBe(true);
    expect(await db.goalContribution.count()).toBe(2);
  });

  it('Beitrag zu unbekanntem Ziel wartet und wird mit dem Ziel aufgelöst', async () => {
    const goalId = crypto.randomUUID();
    const id = await addContribution(db, {
      goalId,
      amountMinor: 100,
      contributedOn: '2027-02-01',
      note: '',
    });
    expect(await db.goalContribution.get(id)).toBeUndefined();
    expect(await waitingRefs(db)).toEqual([{ entity: 'goalContribution', rowId: id }]);
    await appendLocalEvent(db, {
      entity: 'goal',
      rowId: goalId,
      op: 'create',
      data: { ...goalInput, name: 'Sparziel A' },
    });
    await refoldRows(db, await waitingRefs(db), await getMemberIds(db));
    expect((await db.goalContribution.get(id))?.goalId).toBe(goalId);
    expect(await waitingRefs(db)).toEqual([]);
  });
});

describe('Fixkosten buchen', () => {
  const fcInput = (over: Partial<Parameters<typeof createFixedCost>[1]> = {}) => ({
    unit: 'month' as const,
    every: 1,
    startsOn: '2027-01-10',
    name: 'Streaming-Abo A',
    amountMinor: 1299,
    currency: 'CAD' as const,
    categoryId: cat,
    isSaving: false,
    autobook: true,
    ...over,
  });
  const fixedEntries = async () => (await db.entry.toArray()).filter((e) => e.source === 'fixed');

  it('bookFixedCost: booked, already, restored', async () => {
    const fc = await createFixedCost(db, fcInput({ autobook: false }));
    const id = await fixedCostEntryId(fc, '2027-02-10');
    expect(await bookFixedCost(db, fc, '2027-02-10', null)).toBe('booked');
    expect(await db.entry.get(id)).toMatchObject({
      source: 'fixed',
      fixedCostId: fc,
      paidBy: USER,
      amountMinor: 1299,
      bookedOn: '2027-02-10',
      merchant: 'Streaming-Abo A',
      deleted: false,
    });
    expect(await bookFixedCost(db, fc, '2027-02-10', null)).toBe('already');
    await deleteEntry(db, id);
    expect(await bookFixedCost(db, fc, '2027-02-10', null)).toBe('restored');
    expect((await db.entry.get(id))?.deleted).toBe(false);
    expect(await fixedEntries()).toHaveLength(1);
  });

  it('bookFixedCost: Override wird als eigenes update nach dem deterministischen create geschrieben', async () => {
    const fc = await createFixedCost(db, fcInput({ autobook: false }));
    const id = await fixedCostEntryId(fc, '2027-02-10');
    await bookFixedCost(db, fc, '2027-02-10', null, { paidBy: OTHER });
    expect((await fixedEntries())[0]?.paidBy).toBe(OTHER);
    const evs = (await db.events.where('[entity+rowId]').equals(['entry', id]).toArray()).sort(
      (x, y) => (x.hlc < y.hlc ? -1 : 1),
    );
    expect(evs.map((e) => e.op)).toEqual(['create', 'update']);
    expect(evs[0]?.data?.paidBy).toBe(USER); // Standard-Zahler: kleinste Nutzer-ID
    expect(evs[1]?.data).toEqual({ paidBy: OTHER });
  });

  it('runAutobook: ohne Haushaltsmitglieder wird nichts gebucht', async () => {
    await db.meta.put({ key: 'household', value: { members: [] } });
    await createFixedCost(db, fcInput());
    expect(await runAutobook(db, null, '2027-02-20')).toBe(0);
    expect(await fixedEntries()).toHaveLength(0);
  });

  it('runAutobook: Kurse je Fälligkeitstag gleichzeitig; Notbehelfskurs bucht nur für heute vorläufig', async () => {
    await createFixedCost(db, fcInput({ currency: 'EUR', startsOn: '2027-01-20' }));
    const asked: string[] = [];
    let release: () => void = () => {};
    const both = new Promise<void>((r) => {
      release = r;
    });
    let sequential = false;
    const n = await runAutobook(
      db,
      async (dueOn) => {
        asked.push(dueOn);
        if (asked.length === 2) release();
        // sequentielle Abfrage käme nie zu zweit an
        await Promise.race([
          both,
          new Promise((r) => setTimeout(r, 300)).then(() => (sequential = true)),
        ]);
        // Tageskurs nur für den 20.01.; sonst ein früheres Anbieterdatum
        return dueOn === '2027-01-20'
          ? { rateMicro: 1_500_000n, date: dueOn, stale: false }
          : { rateMicro: 1_400_000n, date: '2027-02-19', stale: false };
      },
      '2027-02-20',
    );
    expect(sequential).toBe(false);
    expect(n).toBe(2);
    expect(new Set(asked)).toEqual(new Set(['2027-01-20', '2027-02-20']));
    const byDate = Object.fromEntries((await fixedEntries()).map((e) => [e.bookedOn, e]));
    expect(byDate['2027-01-20']).toMatchObject({ fxRateMicro: 1_500_000, fxProvisional: false });
    expect(byDate['2027-02-20']).toMatchObject({ fxRateMicro: 1_400_000, fxProvisional: true });
  });

  it('bookFixedCost ohne Haushaltsmitglieder wirft NoHouseholdError', async () => {
    await db.meta.put({ key: 'household', value: { members: [] } });
    const fc = await createFixedCost(db, fcInput({ autobook: false }));
    await expect(bookFixedCost(db, fc, '2027-02-10', null)).rejects.toBeInstanceOf(
      NoHouseholdError,
    );
    expect(await fixedEntries()).toHaveLength(0);
  });

  it('Patch an bereits ungültiger Zeile (gleichzeitiger Merge) ist erlaubt, an gültiger nicht', async () => {
    const fc = await createFixedCost(db, fcInput({ autobook: false, endsOn: '2027-12-31' }));
    // Zeile wird durch zwei gleichzeitige Änderungen ungültig: Start nach Ende
    await appendLocalEvent(db, {
      entity: 'fixedCost',
      rowId: fc,
      op: 'update',
      data: { startsOn: '2028-02-01' },
    });
    expect((await db.fixedCost.get(fc))?.startsOn).toBe('2028-02-01');
    // Reparatur über das Ende ist erlaubt, obwohl die Zeile vorher ungültig war
    expect(await updateFixedCost(db, fc, { endsOn: null })).toBe(true);
    // jetzt gültig: ein Patch, der sie ungültig macht, wird abgelehnt
    await expect(updateFixedCost(db, fc, { endsOn: '2027-01-01' })).rejects.toBeInstanceOf(
      InvalidPatchError,
    );
  });

  it('runAutobook: geänderter Starttag bucht keinen Zeitraum doppelt', async () => {
    const fc = await createFixedCost(db, fcInput({ startsOn: '2027-01-15' }));
    expect(await runAutobook(db, null, '2027-02-20')).toBe(1); // 15.02.
    await updateFixedCost(db, fc, { startsOn: '2027-01-01' });
    expect(await runAutobook(db, null, '2027-02-20')).toBe(0); // 01.02. ist abgedeckt
    expect((await fixedEntries()).map((e) => e.bookedOn)).toEqual(['2027-02-15']);
  });

  it('bookFixedCost: EUR ohne Kurs wirft NoRateError, veralteter Kurs ist vorläufig', async () => {
    const fc = await createFixedCost(db, fcInput({ currency: 'EUR', autobook: false }));
    await expect(bookFixedCost(db, fc, '2027-02-10', null)).rejects.toBeInstanceOf(NoRateError);
    expect(await fixedEntries()).toHaveLength(0);
    const rate = { rateMicro: 1_450_000n, date: '2027-02-05', stale: true };
    expect(await bookFixedCost(db, fc, '2027-02-10', rate)).toBe('booked');
    const row = (await fixedEntries())[0];
    expect(row).toMatchObject({ fxRateMicro: 1_450_000, fxProvisional: true });
  });

  it('runAutobook: nur offene Fälligkeiten der letzten 35 Tage, nie doppelt, nie gelöschte', async () => {
    const fc = await createFixedCost(db, fcInput({ startsOn: '2027-01-01' }));
    await createFixedCost(db, fcInput({ name: 'Manuell A', autobook: false }));
    const today = '2027-02-20';
    // Fälligkeiten 01.01. (zu alt), 01.02. (im Fenster)
    expect(await runAutobook(db, null, today)).toBe(1);
    expect((await fixedEntries()).map((e) => e.bookedOn)).toEqual(['2027-02-01']);
    expect(await runAutobook(db, null, today)).toBe(0);
    // Ein Monat später: 01.03. kommt dazu, die gelöschte 01.02. bleibt gelöscht
    await deleteEntry(db, await fixedCostEntryId(fc, '2027-02-01'));
    expect(await runAutobook(db, null, '2027-03-02')).toBe(1);
    const rows = await fixedEntries();
    expect(rows.filter((e) => !e.deleted).map((e) => e.bookedOn)).toEqual(['2027-03-01']);
    expect(rows.filter((e) => e.deleted)).toHaveLength(1);
  });

  it('runAutobook: EUR ohne Kurs wird übersprungen, der Rest gebucht', async () => {
    await createFixedCost(db, fcInput({ name: 'EUR A', currency: 'EUR' }));
    await createFixedCost(db, fcInput({ name: 'CAD A' }));
    expect(await runAutobook(db, null, '2027-02-20')).toBe(1);
    expect((await fixedEntries())[0]?.currency).toBe('CAD');
  });
});

describe('Szenario', () => {
  it('legt das Szenario beim ersten Speichern an und schreibt danach nur Änderungen', async () => {
    expect(await saveScenario(db, { categoryPct: { [cat]: -10 } })).toBe(true);
    const row = await db.scenario.get(SCENARIO_ID);
    expect(row?.categoryPct).toEqual({ [cat]: -10 });
    expect(row?.extras).toEqual([]);
    const before = await db.events.count();
    expect(await saveScenario(db, { categoryPct: { [cat]: -10 } })).toBe(false);
    expect(await db.events.count()).toBe(before);
    expect(await saveScenario(db, { categoryPct: { [cat]: 0 } })).toBe(true);
    expect((await db.scenario.get(SCENARIO_ID))?.categoryPct).toEqual({});
  });

  it('ändert nur die übergebenen Felder (fehlendes categoryPct bleibt erhalten)', async () => {
    await saveScenario(db, { categoryPct: { [cat]: -10 } });
    const extra = {
      id: '00000000-0000-4000-8000-0000000000e1',
      kind: 'expense' as const,
      name: 'Reise A',
      amountMinor: 50_000,
      currency: 'CAD' as const,
      on: '2027-06-01',
    };
    expect(await saveScenario(db, { extras: [extra] })).toBe(true);
    const row = await db.scenario.get(SCENARIO_ID);
    expect(row?.categoryPct).toEqual({ [cat]: -10 });
    expect(row?.extras).toEqual([extra]);
  });

  it('lehnt ungültige Reglerwerte ab und schreibt nichts', async () => {
    const outboxBefore = await db.outbox.count();
    await expect(saveScenario(db, { categoryPct: { [cat]: 7 } })).rejects.toThrow();
    await expect(saveScenario(db, { categoryPct: { [cat]: 60 } })).rejects.toThrow();
    expect(await db.scenario.count()).toBe(0);
    expect(await db.outbox.count()).toBe(outboxBefore);
  });

  it('übernimmt Budgets ab dem Monat und entfernt die übernommenen Regler', async () => {
    await saveScenario(db, { categoryPct: { [cat]: -20 } });
    await adoptScenarioBudgets(
      db,
      [{ categoryId: cat, fromMinor: 100_000n, toMinor: 80_000n }],
      '2027-04-01',
    );
    const b = (await db.budget.toArray()).find(
      (r) => r.categoryId === cat && r.validFrom === '2027-04-01',
    );
    expect(b?.monthlyLimitCadMinor).toBe(80_000);
    expect((await db.scenario.get(SCENARIO_ID))?.categoryPct).toEqual({});
  });
});
