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
      'income',
      'fixedCost',
      'goal',
      'goalContribution',
      'scenario',
    ]) {
      expect(db.tables.map((t) => t.name)).toContain(table);
    }
    db.close();
  });
});

describe('Dexie-Migration von Version 2 auf 3', () => {
  it('erhält Ereignisse und materialisierte Zeilen und legt die M3-Tabellen an', async () => {
    const name = 'migration-test-v3';
    const old = new Dexie(name);
    old.version(2).stores({
      meta: 'key',
      events: 'id, [entity+rowId], hlc',
      outbox: 'id',
      conflicts: 'id, entity',
      parked: 'key',
      settings: 'id',
      member: 'id',
      category: 'id, sort',
      entry: 'id, bookedOn, categoryId, deleted',
      budget: 'id, categoryId, validFrom',
    });
    await old.open();
    await old.table('meta').put({ key: 'deviceId', value: 'dev-1' });
    await old.table('category').put({ id: 'c1', name: 'Lebensmittel', sort: 0 });
    await old.table('entry').put({ id: 'e1', bookedOn: '2027-01-02', categoryId: 'c1' });
    await old.table('events').put({ id: 'ev1', hlc: 'h', entity: 'entry', rowId: 'e1' });
    old.close();

    const db = new MapleJarDb(name);
    await db.open();
    expect((await db.meta.get('deviceId'))?.value).toBe('dev-1');
    expect(await db.category.count()).toBe(1);
    expect((await db.entry.get('e1'))?.categoryId).toBe('c1');
    expect(await db.events.count()).toBe(1);
    for (const t of [db.income, db.fixedCost, db.goal, db.goalContribution]) {
      expect(await t.count()).toBe(0);
    }
    db.close();
  });
});

describe('Dexie-Migration auf Version 4', () => {
  it('erhält Daten aus Version 3 und legt die Tabelle scenario an', async () => {
    const name = 'migration-test-v4';
    const old = new Dexie(name);
    old.version(3).stores({
      meta: 'key',
      events: 'id, [entity+rowId], hlc',
      outbox: 'id',
      conflicts: 'id, entity',
      parked: 'key',
      settings: 'id',
      member: 'id',
      category: 'id, sort',
      entry: 'id, bookedOn, categoryId, deleted',
      budget: 'id, categoryId, validFrom',
      income: 'id, startsOn',
      fixedCost: 'id, categoryId, startsOn',
      goal: 'id, targetDate',
      goalContribution: 'id, goalId, contributedOn',
    });
    await old.open();
    await old.table('meta').put({ key: 'deviceId', value: 'dev-1' });
    await old.table('entry').put({ id: 'x', deleted: false });
    await old.table('goal').put({ id: 'x', deleted: false });
    old.close();

    const db = new MapleJarDb(name);
    await db.open();
    expect((await db.meta.get('deviceId'))?.value).toBe('dev-1');
    expect((await db.entry.get('x'))?.deleted).toBe(false);
    expect((await db.goal.get('x'))?.deleted).toBe(false);
    expect(db.tables.map((t) => t.name)).toContain('scenario');
    expect(db.verno).toBe(4);
    db.close();
  });
});
