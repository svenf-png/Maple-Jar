import { describe, expect, it } from 'vitest';
import { parseEvent } from './schema';
import { categoryData, entryData, mk } from './test-helpers';

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
    expect(ok({ ...mk({ op: 'delete' }), entity: 'goal' })).toBe(false);
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
