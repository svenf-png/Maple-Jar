import { describe, expect, it } from 'vitest';
import {
  autobookCandidates,
  bookingDraft,
  bookingState,
  defaultPayer,
  dueNext,
  dueWithIds,
  fixedCostEntryId,
  isBooked,
  occurrenceIds,
} from './fixed-cost';
import type { KnownRate } from './fx';
import { entry, fixedCost } from './test-data';

// Gleiche Regel wie zod 4 `z.uuid()`.
const ZOD_UUID =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

describe('fixedCostEntryId', () => {
  it('ist deterministisch und unterscheidet Fixkosten und Tag', async () => {
    const a = await fixedCostEntryId('fixkosten-a', '2027-02-01');
    expect(await fixedCostEntryId('fixkosten-a', '2027-02-01')).toBe(a);
    expect(await fixedCostEntryId('fixkosten-a', '2027-02-02')).not.toBe(a);
    expect(await fixedCostEntryId('fixkosten-b', '2027-02-01')).not.toBe(a);
  });
  it('ist eine gültige UUID (Version 8, Variante 10xx)', async () => {
    for (const day of ['2027-02-01', '2027-03-31', '2028-02-29']) {
      const id = await fixedCostEntryId('fixkosten-a', day);
      expect(id).toMatch(ZOD_UUID);
      expect(id[14]).toBe('8');
      expect('89ab').toContain(id[19]);
    }
  });
});

describe('Buchungszustand', () => {
  it('open, booked, deleted', () => {
    expect(bookingState('x', [])).toBe('open');
    expect(bookingState('x', [entry({ id: 'x' })])).toBe('booked');
    expect(bookingState('x', [entry({ id: 'x', deleted: true })])).toBe('deleted');
    expect(isBooked('booked')).toBe(true);
    expect(isBooked('deleted')).toBe(false);
    expect(isBooked('open')).toBe(false);
  });
});

describe('dueWithIds', () => {
  it('ignoriert gelöschte Fixkosten, sortiert nach Datum', async () => {
    const a = fixedCost({ id: 'fa', startsOn: '2027-02-15' });
    const b = fixedCost({ id: 'fb', startsOn: '2027-02-05' });
    const gone = fixedCost({ id: 'fc', startsOn: '2027-02-10', deleted: true });
    const items = await dueWithIds([a, b, gone], [], '2027-02-01', '2027-02-28');
    expect(items.map((i) => [i.fixedCostId, i.dueOn, i.state])).toEqual([
      ['fb', '2027-02-05', 'open'],
      ['fa', '2027-02-15', 'open'],
    ]);
  });
});

describe('dueNext', () => {
  const today = '2027-02-10';
  it('überfällige der letzten 35 Tage und Fälligkeiten im Horizont, offen und sortiert', async () => {
    const fc = fixedCost({ id: 'fa', startsOn: '2026-12-20', unit: 'month' }); // 20.01., 20.02. ...
    const items = await dueNext([fc], [], today, 5);
    expect(items.map((i) => i.dueOn)).toEqual(['2027-01-20']);
    const far = await dueNext([fc], [], today, 10);
    expect(far.map((i) => i.dueOn)).toEqual(['2027-01-20', '2027-02-20']);
  });
  it('nicht älter als 35 Tage', async () => {
    const fc = fixedCost({ id: 'fa', startsOn: '2027-01-05', unit: 'once' });
    expect(await dueNext([fc], [], '2027-02-10', 7)).toHaveLength(0); // 36 Tage zurück
    expect(await dueNext([fc], [], '2027-02-09', 7)).toHaveLength(1); // genau 35 Tage
  });
  it('gebuchte und gelöschte Buchungen erscheinen nicht', async () => {
    const fc = fixedCost({ id: 'fa', startsOn: '2027-02-12', unit: 'once' });
    const id = await fixedCostEntryId('fa', '2027-02-12');
    expect(await dueNext([fc], [entry({ id })], today, 7)).toEqual([]);
    expect(await dueNext([fc], [entry({ id, deleted: true })], today, 7)).toEqual([]);
    const open = await dueNext([fc], [], today, 7);
    expect(open).toEqual([{ fixedCostId: 'fa', dueOn: '2027-02-12', entryId: id, state: 'open' }]);
  });
  it('Ende der Fixkosten wird respektiert', async () => {
    const fc = fixedCost({ id: 'fa', startsOn: '2027-01-01', endsOn: '2027-02-15' });
    expect((await dueNext([fc], [], '2027-03-10', 40)).map((i) => i.dueOn)).toEqual([]);
    const fc2 = fixedCost({ id: 'fb', startsOn: '2027-01-12', endsOn: '2027-02-12' });
    expect((await dueNext([fc2], [], today, 40)).map((i) => i.dueOn)).toEqual([
      '2027-01-12',
      '2027-02-12',
    ]);
  });
});

describe('autobookCandidates', () => {
  const today = '2027-02-10';
  it('nur autobook, nicht in der Zukunft, nicht älter als 35 Tage', async () => {
    const auto = fixedCost({ id: 'fa', autobook: true, startsOn: '2026-11-01', unit: 'month' });
    const manual = fixedCost({ id: 'fb', autobook: false, startsOn: '2026-11-01', unit: 'month' });
    const c = await autobookCandidates([auto, manual], [], today);
    expect(c.map((i) => [i.fixedCostId, i.dueOn])).toEqual([['fa', '2027-02-01']]);
    const old = fixedCost({ id: 'fc', autobook: true, startsOn: '2027-01-05', unit: 'once' });
    expect(await autobookCandidates([old], [], '2027-02-10')).toEqual([]);
    expect(await autobookCandidates([old], [], '2027-02-09')).toHaveLength(1);
  });
  it('bereits gebuchte werden nicht erneut vorgeschlagen', async () => {
    const fc = fixedCost({ id: 'fa', autobook: true, startsOn: '2027-02-01', unit: 'once' });
    const id = await fixedCostEntryId('fa', '2027-02-01');
    expect(await autobookCandidates([fc], [entry({ id })], today)).toEqual([]);
  });
  it('ein gelöschter gebuchter Eintrag wird NICHT neu gebucht', async () => {
    const fc = fixedCost({ id: 'fa', autobook: true, startsOn: '2027-02-01', unit: 'once' });
    const id = await fixedCostEntryId('fa', '2027-02-01');
    expect(await autobookCandidates([fc], [entry({ id, deleted: true })], today)).toEqual([]);
  });
  it('gelöschte Fixkosten werden nicht gebucht', async () => {
    const fc = fixedCost({
      id: 'fa',
      autobook: true,
      deleted: true,
      startsOn: '2027-02-01',
      unit: 'once',
    });
    expect(await autobookCandidates([fc], [], today)).toEqual([]);
  });
});

describe('occurrenceIds', () => {
  it('bildet Schlüssel auf IDs ab, auch für gelöschte Fixkosten', async () => {
    const fc = fixedCost({ id: 'fa', startsOn: '2027-02-01', deleted: true });
    const m = await occurrenceIds([fc], '2027-02-01', '2027-03-31');
    expect([...m.keys()]).toEqual(['fa:2027-02-01', 'fa:2027-03-01']);
    expect(m.get('fa:2027-02-01')).toBe(await fixedCostEntryId('fa', '2027-02-01'));
  });
});

describe('bookingDraft', () => {
  const rate: KnownRate = { rateMicro: 1_450_000n, date: '2027-02-09', stale: true };
  it('CAD: Kurs 1, Datum = Fälligkeit', () => {
    const fc = fixedCost({ id: 'fa', amountMinor: 120_000, categoryId: 'kat-a' });
    expect(bookingDraft(fc, '2027-02-01', null)).toEqual({
      amountMinor: 120_000,
      currency: 'CAD',
      bookedOn: '2027-02-01',
      categoryId: 'kat-a',
      source: 'fixed',
      fixedCostId: 'fa',
      fxRateMicro: 1_000_000,
      fxRateDate: '2027-02-01',
      fxProvisional: false,
    });
  });
  it('EUR mit Kurs: vorläufig, wenn der Kurs veraltet ist', () => {
    const fc = fixedCost({ currency: 'EUR', amountMinor: 999 });
    const d = bookingDraft(fc, '2027-02-10', rate);
    expect(d).toMatchObject({
      currency: 'EUR',
      fxRateMicro: 1_450_000,
      fxRateDate: '2027-02-09',
      fxProvisional: true,
    });
  });
  it('EUR ohne Kurs: null', () => {
    expect(bookingDraft(fixedCost({ currency: 'EUR' }), '2027-02-10', null)).toBeNull();
  });
});

describe('defaultPayer', () => {
  it('kleinste Nutzer-ID, unabhängig von der Reihenfolge; null ohne Mitglieder', () => {
    expect(defaultPayer([{ userId: 'b' }, { userId: 'a' }])).toBe('a');
    expect(defaultPayer([{ userId: 'a' }, { userId: 'b' }])).toBe('a');
    expect(defaultPayer([])).toBeNull();
  });
});
