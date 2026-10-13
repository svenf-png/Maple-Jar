import { describe, expect, it } from 'vitest';
import type { ConflictRow } from '../../data/db';
import { formatHlc } from '../../data/events/hlc';
import { differingFields, versionsOf } from './versions';

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
});
