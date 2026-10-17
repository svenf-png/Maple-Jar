import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type EventRow, MapleJarDb } from './db';
import { pendingRowKeys } from './pending';

let db: MapleJarDb;
let counter = 0;

function event(id: string, entity: EventRow['entity'], rowId: string): EventRow {
  return {
    id,
    hlc: `0000000000000:0000:${id}`,
    entity,
    rowId,
    device: 'dev-a',
    author: 'person-a',
    op: 'update',
    base: [],
    v: 1,
  };
}

beforeEach(async () => {
  db = new MapleJarDb(`pending-test-${++counter}`);
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe('pendingRowKeys', () => {
  it('liefert die Zeilen, deren Ereignis noch in der Outbox liegt', async () => {
    await db.events.bulkPut([event('e1', 'entry', 'r1'), event('e2', 'entry', 'r2')]);
    await db.outbox.put({ id: 'e1' });
    expect(await pendingRowKeys(db)).toEqual(new Set(['entry:r1']));
  });

  it('ist leer, wenn die Outbox leer ist', async () => {
    await db.events.put(event('e1', 'entry', 'r1'));
    expect(await pendingRowKeys(db)).toEqual(new Set());
  });

  it('überspringt Outbox-Einträge ohne Ereignis', async () => {
    await db.outbox.put({ id: 'fehlt' });
    expect(await pendingRowKeys(db)).toEqual(new Set());
  });
});
