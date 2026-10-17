import { describe, expect, it } from 'vitest';
import { parseEvent } from './schema';
import {
  categoryData,
  contributionData,
  entryData,
  fixedCostData,
  goalData,
  incomeData,
  mk,
} from './test-helpers';

const ok = (e: unknown) => parseEvent(e).ok;

describe('parseEvent', () => {
  it('accepts valid create and update events', () => {
    expect(ok(mk({ op: 'create', data: entryData() }))).toBe(true);
    expect(ok(mk({ op: 'update', data: { note: 'Test' } }))).toBe(true);
    expect(ok(mk({ entity: 'category', op: 'create', data: categoryData() }))).toBe(true);
  });

  it('accepts delete and restore without data and treats null data as absent', () => {
    expect(ok(mk({ op: 'delete' }))).toBe(true);
    expect(ok({ ...mk({ op: 'restore' }), data: null })).toBe(true);
  });

  it('rejects data on delete', () => {
    expect(ok(mk({ op: 'delete', data: { note: 'x' } }))).toBe(false);
  });

  it('rejects wrong amounts (zero, float, negative)', () => {
    for (const amountMinor of [0, 12.5, -3]) {
      expect(ok(mk({ op: 'create', data: entryData({ amountMinor }) }))).toBe(false);
    }
  });

  it('rejects CAD entries with a rate other than 1', () => {
    expect(ok(mk({ op: 'create', data: entryData({ fxRateMicro: 1_500_000 }) }))).toBe(false);
    expect(
      ok(mk({ op: 'create', data: entryData({ currency: 'EUR', fxRateMicro: 1_500_000 }) })),
    ).toBe(true);
  });

  it('rejects unknown currencies, unknown fields and incomplete creates', () => {
    expect(ok(mk({ op: 'create', data: entryData({ currency: 'USD' }) }))).toBe(false);
    expect(ok(mk({ op: 'create', data: entryData({ extra: 1 }) }))).toBe(false);
    const { merchant: _omit, ...partial } = entryData();
    expect(ok(mk({ op: 'create', data: partial }))).toBe(false);
  });

  it('rejects an empty update', () => {
    expect(ok(mk({ op: 'update', data: {} }))).toBe(false);
    expect(ok(mk({ op: 'update' }))).toBe(false);
  });

  it('rejects future schema versions, bad ids and bad clocks', () => {
    expect(ok({ ...mk({ op: 'delete' }), v: 2 })).toBe(false);
    expect(ok({ ...mk({ op: 'delete' }), id: 'nope' })).toBe(false);
    expect(ok({ ...mk({ op: 'delete' }), hlc: 'later' })).toBe(false);
    expect(ok({ ...mk({ op: 'delete' }), entity: 'receipt' })).toBe(false);
    expect(ok('garbage')).toBe(false);
    expect(ok(null)).toBe(false);
  });

  it('reports a reason with the path but never the value', () => {
    const r = parseEvent(
      mk({ op: 'create', data: entryData({ merchant: 12345678, note: 'GEHEIM' }) }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('entry.create');
      expect(r.reason).not.toContain('12345678');
      expect(r.reason).not.toContain('GEHEIM');
    }
  });
});

describe('parseEvent: M3-Entitäten', () => {
  const create = (entity: 'income' | 'fixedCost' | 'goal' | 'goalContribution', data: object) =>
    ok(mk({ entity, op: 'create', data: data as Record<string, unknown> }));

  it('akzeptiert gültige create- und update-Ereignisse', () => {
    expect(create('income', incomeData())).toBe(true);
    expect(create('income', incomeData({ endsOn: '2027-12-31', unit: 'week', every: 2 }))).toBe(
      true,
    );
    expect(create('fixedCost', fixedCostData({ icon: 'abo' }))).toBe(true);
    expect(create('goal', goalData({ archivedAt: '2027-06-01' }))).toBe(true);
    expect(create('goalContribution', contributionData())).toBe(true);
    expect(create('goalContribution', contributionData({ amountMinor: -300 }))).toBe(true);
    expect(ok(mk({ entity: 'goal', op: 'update', data: { archivedAt: '2027-06-01' } }))).toBe(true);
    expect(ok(mk({ entity: 'goalContribution', op: 'delete' }))).toBe(true);
  });

  it('null löscht optionale Felder nur in update, nicht in create', () => {
    const upd = (entity: 'income' | 'fixedCost' | 'goal', data: Record<string, unknown>) =>
      ok(mk({ entity, op: 'update', data }));
    expect(upd('income', { endsOn: null, memberId: null })).toBe(true);
    expect(upd('fixedCost', { endsOn: null, icon: null })).toBe(true);
    expect(upd('goal', { archivedAt: null })).toBe(true);
    expect(upd('income', { name: null })).toBe(false);
    expect(upd('goal', { icon: null })).toBe(false);
    expect(create('income', incomeData({ endsOn: null }))).toBe(false);
    expect(create('goal', goalData({ archivedAt: null }))).toBe(false);
  });

  it('lehnt ungültige Beträge, Wiederholungen und Felder ab', () => {
    expect(create('income', incomeData({ amountMinor: 0 }))).toBe(false);
    expect(create('income', incomeData({ every: 0 }))).toBe(false);
    expect(create('income', incomeData({ every: 53 }))).toBe(false);
    expect(create('income', incomeData({ unit: 'day' }))).toBe(false);
    expect(create('income', incomeData({ extra: 1 }))).toBe(false);
    expect(create('fixedCost', fixedCostData({ categoryId: 'x' }))).toBe(false);
    expect(create('goal', goalData({ targetMinor: -1 }))).toBe(false);
    expect(create('goalContribution', contributionData({ amountMinor: 0 }))).toBe(false);
    expect(create('goalContribution', contributionData({ amountMinor: 1.5 }))).toBe(false);
    expect(create('goalContribution', contributionData({ amountMinor: 2_000_000_000_000 }))).toBe(
      false,
    );
  });

  it('prüft endsOn >= startsOn, targetDate > startsOn und once-Regeln', () => {
    expect(create('income', incomeData({ endsOn: '2026-12-31' }))).toBe(false);
    expect(create('fixedCost', fixedCostData({ endsOn: '2027-01-04' }))).toBe(false);
    expect(create('fixedCost', fixedCostData({ endsOn: '2027-01-05' }))).toBe(true);
    expect(create('goal', goalData({ targetDate: '2027-01-01' }))).toBe(false);
    expect(create('goal', goalData({ targetDate: '2027-01-02' }))).toBe(true);
    expect(create('income', incomeData({ unit: 'once' }))).toBe(true);
    expect(create('income', incomeData({ unit: 'once', every: 2 }))).toBe(false);
    expect(create('fixedCost', fixedCostData({ unit: 'once', endsOn: '2027-02-01' }))).toBe(false);
  });

  it('lehnt update und restore für goalContribution ab, ohne Werte im Grund', () => {
    const u = parseEvent(
      mk({ entity: 'goalContribution', op: 'update', data: { note: 'geheim' } }),
    );
    const r = parseEvent(mk({ entity: 'goalContribution', op: 'restore' }));
    expect(u.ok).toBe(false);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(u)).not.toContain('geheim');
  });

  it('lehnt data bei delete/restore und leere Updates ab', () => {
    expect(ok(mk({ entity: 'goal', op: 'delete', data: { name: 'x' } }))).toBe(false);
    expect(ok(mk({ entity: 'income', op: 'update', data: {} }))).toBe(false);
  });
});

describe('scenario', () => {
  const CAT = '00000000-0000-4000-8000-0000000000c1';
  const X = '00000000-0000-4000-8000-0000000000e1';
  const goalExtra = {
    id: X,
    kind: 'goal',
    name: 'Ziel A',
    amountMinor: 50_000,
    currency: 'CAD',
    on: '2027-03-01',
    targetDate: '2027-09-01',
  };
  const sc = (op: 'create' | 'update', data: Record<string, unknown>) =>
    ok(mk({ entity: 'scenario', op, data }));

  it('akzeptiert ein gültiges Szenario', () => {
    expect(sc('create', { categoryPct: { [CAT]: -20 }, extras: [goalExtra] })).toBe(true);
    expect(sc('create', { categoryPct: {}, extras: [] })).toBe(true);
    expect(sc('update', { categoryPct: { [CAT]: 50 } })).toBe(true);
  });
  it('lehnt Reglerwerte außerhalb −50..50 oder nicht in 5er-Schritten ab', () => {
    expect(sc('update', { categoryPct: { [CAT]: 7 } })).toBe(false);
    expect(sc('update', { categoryPct: { [CAT]: 55 } })).toBe(false);
    expect(sc('update', { categoryPct: { [CAT]: -55 } })).toBe(false);
    expect(sc('update', { categoryPct: { 'keine-uuid': 5 } })).toBe(false);
  });
  it('prüft Extras: goal braucht targetDate > on, expense hat keins', () => {
    expect(sc('update', { extras: [{ ...goalExtra, targetDate: '2027-03-01' }] })).toBe(false);
    const { targetDate: _t, ...noTarget } = goalExtra;
    expect(sc('update', { extras: [noTarget] })).toBe(false);
    expect(sc('update', { extras: [{ ...noTarget, kind: 'expense' }] })).toBe(true);
    expect(sc('update', { extras: [{ ...goalExtra, kind: 'expense' }] })).toBe(false);
    expect(sc('update', { extras: [{ ...goalExtra, amountMinor: 0 }] })).toBe(false);
  });
  it('begrenzt Extras auf 50 und Regler auf 200 Kategorien', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      ...goalExtra,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    }));
    expect(sc('update', { extras: many })).toBe(false);
    const pct = Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => [
        `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        5,
      ]),
    );
    expect(sc('update', { categoryPct: pct })).toBe(false);
  });
});
