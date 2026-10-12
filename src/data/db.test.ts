import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { MapleJarDb } from './db';

describe('Dexie-Migration auf Version 2', () => {
  it('erhält meta-Daten, entfernt Reste der GitHub-Anbindung und legt die neuen Tabellen an', async () => {
    const name = 'migration-test';
    const old = new Dexie(name);
    old.version(1).stores({ meta: 'key' });
    await old.open();
    await old.table('meta').bulkPut([
      { key: 'token', value: 'alt' },
      { key: 'repo', value: 'alt' },
      { key: 'household', value: { format: 1 } },
      { key: 'deviceId', value: 'dev-1' },
      { key: 'fx:last:ECB', value: { rateMicro: '1610000', date: '2027-01-01' } },
    ]);
    old.close();

    const db = new MapleJarDb(name);
    await db.open();
    const keys = (await db.meta.toArray()).map((r) => r.key).sort();
    expect(keys).toEqual(['deviceId', 'fx:last:ECB']);
    for (const table of [
      'events',
      'outbox',
      'conflicts',
      'parked',
      'settings',
      'member',
      'category',
      'entry',
      'budget',
    ]) {
      expect(db.tables.map((t) => t.name)).toContain(table);
    }
    db.close();
  });
});
