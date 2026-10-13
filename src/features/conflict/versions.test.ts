import { describe, expect, it } from 'vitest';
import type { ConflictRow } from '../../data/db';
import { formatHlc } from '../../data/events/hlc';
import { differingFields, shouldAutoResolve, versionsOf } from './versions';

const D = '00000000-0000-4000-8000-0000000000d1';
const hlc = (ms: number) => formatHlc({ ms, counter: 0 }, D);
const conflict: ConflictRow = {
  id: 'entry:x',
  entity: 'entry',
  rowId: 'x',
  kind: 'fields',
  eventIds: ['e1', 'e2'],
  fields: [
    {
      field: 'amountMinor',
      candidates: [
        { eventId: 'e1', value: 9000, hlc: hlc(2000), author: 'a' },
        { eventId: 'e2', value: 9500, hlc: hlc(1000), author: 'b' },
      ],
    },
    {
      field: 'note',
      candidates: [
        { eventId: 'e1', value: 'x', hlc: hlc(2000), author: 'a' },
        { eventId: 'e2', value: 'x', hlc: hlc(1000), author: 'b' },
      ],
    },
  ],
};

describe('versionsOf', () => {
  it('sortiert nach Zeit und zeigt nur abweichende Felder', () => {
    const v = versionsOf(conflict, {});
    expect(v.map((x) => x.eventId)).toEqual(['e2', 'e1']);
    expect(v[0]?.values).toEqual({ amountMinor: 9500, note: 'x' });
    expect(differingFields(conflict, v)).toEqual(['amountMinor']);
  });

  it('fasst Versionen zusammen, die sich nur in ausgeblendeten Feldern unterscheiden', () => {
    const c: ConflictRow = {
      ...conflict,
      fields: [
        {
          field: 'fxRateDate',
          candidates: [
            { eventId: 'e1', value: '2027-01-02', hlc: hlc(2000), author: 'a' },
            { eventId: 'e2', value: '2027-01-03', hlc: hlc(1000), author: 'b' },
          ],
        },
      ],
    };
    const v = versionsOf(c, { amountMinor: 1 });
    expect(v).toHaveLength(1);
    expect(v[0]?.eventId).toBe('e1');
    expect(differingFields(c, v)).toEqual([]);
  });

  it('Geldsatz: Währung und Kurs kommen aus der eigenen Vorgeschichte jeder Version', () => {
    const ev = (
      id: string,
      ms: number,
      base: string[],
      data: Record<string, unknown>,
      op = 'update',
    ) =>
      ({
        id,
        hlc: hlc(ms),
        entity: 'entry',
        rowId: 'x',
        device: D,
        author: id,
        op,
        base,
        v: 1,
        data,
      }) as never;
    const events = [
      ev('c0', 100, [], { amountMinor: 1000, currency: 'CAD', fxRateMicro: 1_000_000 }, 'create'),
      ev('e1', 2000, ['c0'], { amountMinor: 5000, currency: 'EUR', fxRateMicro: 1_500_000 }),
      ev('e2', 1000, ['c0'], { amountMinor: 7000 }),
    ];
    const c: ConflictRow = {
      ...conflict,
      fields: [
        {
          field: 'amountMinor',
          candidates: [
            { eventId: 'e1', value: 5000, hlc: hlc(2000), author: 'e1' },
            { eventId: 'e2', value: 7000, hlc: hlc(1000), author: 'e2' },
          ],
        },
      ],
    };
    const v = versionsOf(c, { amountMinor: 5000, currency: 'EUR', fxRateMicro: 1_500_000 }, events);
    expect(v.find((x) => x.eventId === 'e2')?.values).toMatchObject({
      amountMinor: 7000,
      currency: 'CAD',
      fxRateMicro: 1_000_000,
    });
    expect(v.find((x) => x.eventId === 'e1')?.values).toMatchObject({
      amountMinor: 5000,
      currency: 'EUR',
    });
    expect(differingFields(c, v)).toEqual(['amountMinor', 'currency', 'fxRateMicro']);
  });
});

describe('shouldAutoResolve', () => {
  it('wartet auf die geladenen Ereignisse und auf „nichts Sichtbares strittig“', () => {
    expect(shouldAutoResolve(undefined, [])).toBe(false);
    expect(shouldAutoResolve([], ['amountMinor'])).toBe(false);
    expect(shouldAutoResolve([], [])).toBe(true);
  });
});
