import { beforeEach, describe, expect, it } from 'vitest';
import { differingFields, keptValues, versionsOf } from '../features/conflict/versions';
import { updateEntry } from './actions';
import { confirmDelete, keepBoth, keepVersion, restoreRow } from './conflict-actions';
import { MapleJarDb } from './db';
import { CAT_1, categoryData, entryData, ROW_1 } from './events/test-helpers';
import type { Household } from './household';
import type { MemoryTransport } from './remote/memory-transport';
import { MemoryServer } from './remote/memory-transport';
import { runSync } from './sync/cycle';
import { appendLocalEvent } from './write';

const A = {
  username: 'person-a',
  password: 'pw-a-12345',
  userId: '00000000-0000-4000-8000-0000000000a1',
};
const B = {
  username: 'person-b',
  password: 'pw-b-12345',
  userId: '00000000-0000-4000-8000-0000000000b1',
};
const GOAL = '00000000-0000-4000-8000-000000000201';
const FIXED = '00000000-0000-4000-8000-000000000202';
const INCOME = '00000000-0000-4000-8000-000000000203';

interface Device {
  db: MapleJarDb;
  transport: MemoryTransport;
  now: number;
}
let n = 0;
async function makeDevice(server: MemoryServer, u: typeof A, deviceId: string): Promise<Device> {
  const db = new MapleJarDb(`conflict-test-${++n}`);
  const transport = server.client();
  await transport.signIn(u.username, u.password);
  await db.meta.bulkPut([
    { key: 'deviceId', value: deviceId },
    { key: 'userId', value: u.userId },
  ]);
  return { db, transport, now: Date.UTC(2027, 0, 5, 10) };
}
const household = (): Household => ({
  formatVersion: 1,
  householdId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2027-01-01T00:00:00.000Z',
  settings: {
    name: 'Testhaushalt',
    placeLabel: null,
    periodStart: '2027-01-01',
    periodEnd: '2027-12-31',
    baseCurrency: 'CAD',
    secondCurrency: 'EUR',
    fxProvider: 'ECB',
  },
  members: [A, B].map((u, i) => ({
    userId: u.userId,
    username: u.username,
    displayName: `Person ${i ? 'B' : 'A'}`,
    color: '#2C6CB0',
    locale: 'de-DE' as const,
    theme: 'auto' as const,
  })),
});
const write = (d: Device, input: Parameters<typeof appendLocalEvent>[1]) => {
  d.now += 1000;
  return appendLocalEvent(d.db, input, d.now);
};
const sync = (d: Device) => runSync(d.db, d.transport, { nowMs: d.now });
const settle = async (a: Device, b: Device) => {
  await sync(a);
  await sync(b);
  await sync(a);
  await sync(b);
};

let a: Device;
let b: Device;
beforeEach(async () => {
  const server = new MemoryServer([A, B]);
  await server.client().signIn(A.username, A.password);
  server.household = { ...household(), members: undefined } as never;
  server.members = household().members;
  a = await makeDevice(server, A, '00000000-0000-4000-8000-0000000000d1');
  b = await makeDevice(server, B, '00000000-0000-4000-8000-0000000000d2');
  await sync(a);
  await sync(b);
  await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
  await write(a, { entity: 'entry', rowId: ROW_1, op: 'create', data: entryData() });
  await write(a, {
    entity: 'goal',
    rowId: GOAL,
    op: 'create',
    data: {
      name: 'Sparziel A',
      icon: 'sparen',
      color: '#2C6CB0',
      targetMinor: 100000,
      currency: 'CAD',
      startsOn: '2027-01-01',
      targetDate: '2028-01-01',
    },
  });
  await write(a, {
    entity: 'fixedCost',
    rowId: FIXED,
    op: 'create',
    data: {
      name: 'Streaming-Abo A',
      amountMinor: 1500,
      currency: 'CAD',
      unit: 'month',
      every: 1,
      startsOn: '2027-01-01',
      categoryId: CAT_1,
      isSaving: false,
      autobook: false,
    },
  });
  await write(a, {
    entity: 'income',
    rowId: INCOME,
    op: 'create',
    data: {
      name: 'Gehalt A',
      amountMinor: 300000,
      currency: 'CAD',
      unit: 'month',
      every: 1,
      startsOn: '2027-01-01',
    },
  });
  await settle(a, b);
});

/** Versionen des offenen Konflikts wie der Dialog sie bildet. */
const versionsFor = async (d: Device) => {
  const conflict = await d.db.conflicts.get(`entry:${ROW_1}`);
  const row = await d.db.entry.get(ROW_1);
  const events = await d.db.events.where('[entity+rowId]').equals(['entry', ROW_1]).toArray();
  return versionsOf(conflict as never, row as never, events);
};

const both = async (fn: (d: Device) => Promise<void>) => {
  await fn(a);
  await fn(b);
};

describe('Konflikt auflösen über zwei Geräte', () => {
  it.each([
    ['entry', ROW_1, 'amountMinor', 9000, 9500],
    ['goal', GOAL, 'targetMinor', 200000, 300000],
    ['fixedCost', FIXED, 'amountMinor', 1600, 1700],
    ['income', INCOME, 'amountMinor', 310000, 320000],
  ] as const)(
    'keepVersion %s beendet den Konflikt auf beiden Geräten',
    async (entity, id, field, va, vb) => {
      await write(a, { entity, rowId: id, op: 'update', data: { [field]: va } });
      await write(b, { entity, rowId: id, op: 'update', data: { [field]: vb } });
      await settle(a, b);
      await both(async (d) => expect(await d.db.conflicts.get(`${entity}:${id}`)).toBeDefined());
      expect(await keepVersion(a.db, entity, id, { [field]: vb })).toBe(true);
      await settle(a, b);
      await both(async (d) => {
        expect(await d.db.conflicts.count()).toBe(0);
        expect(await d.db[entity].get(id)).toMatchObject({ [field]: vb, conflict: false });
      });
    },
  );

  it('keepBoth: eine Version bleibt, die andere wird neuer Eintrag, kein Konflikt mehr', async () => {
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9000 } });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9500 } });
    await settle(a, b);
    const ids = await keepBoth(a.db, ROW_1, await versionsFor(a));
    expect(ids).toHaveLength(1);
    await settle(a, b);
    await both(async (d) => {
      expect(await d.db.conflicts.count()).toBe(0);
      const live = (await d.db.entry.toArray()).filter((e) => !e.deleted);
      expect(live.map((e) => e.amountMinor).sort()).toEqual([9000, 9500]);
      expect(await d.db.entry.get(ids[0] as string)).toMatchObject({
        source: 'manual',
        deleted: false,
      });
    });
  });

  it('keepBoth auf beiden Geräten (auch mit gegensätzlicher Auswahl): genau eine Kopie, kein neuer Konflikt', async () => {
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9000 } });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9500 } });
    await settle(a, b);
    const idsA = await keepBoth(a.db, ROW_1, await versionsFor(a));
    const idsB = await keepBoth(b.db, ROW_1, await versionsFor(b));
    expect(idsA).toEqual(idsB);
    await settle(a, b);
    await both(async (d) => {
      const live = (await d.db.entry.toArray()).filter((e) => !e.deleted);
      expect(live.map((e) => e.amountMinor).sort()).toEqual([9000, 9500]);
      expect(await d.db.conflicts.count()).toBe(0);
    });
  });

  it('Währung bleibt mit dem Betrag zusammen: Version von B ergibt CAD 70,00, nicht EUR', async () => {
    await updateEntry(a.db, ROW_1, {
      currency: 'EUR',
      amountMinor: 5000,
      rate: { rateMicro: 1_500_000, rateDate: '2027-01-02' } as never,
    });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 7000 } });
    await settle(a, b);
    const conflict = await b.db.conflicts.get(`entry:${ROW_1}`);
    const row = await b.db.entry.get(ROW_1);
    const events = await b.db.events.where('[entity+rowId]').equals(['entry', ROW_1]).toArray();
    const versions = versionsOf(conflict as never, row as never, events);
    expect(differingFields(conflict as never, versions)).toContain('currency');
    const mine = versions.find((v) => v.author === B.userId);
    expect(mine?.values).toMatchObject({ amountMinor: 7000, currency: 'CAD' });
    await keepVersion(b.db, 'entry', ROW_1, mine?.values ?? {});
    await settle(a, b);
    await both(async (d) =>
      expect(await d.db.entry.get(ROW_1)).toMatchObject({
        amountMinor: 7000,
        currency: 'CAD',
        fxRateMicro: 1_000_000,
        conflict: false,
      }),
    );
  });

  it('Feldkonflikt mit gleichzeitigem Löschen: keepVersion stellt wieder her, atomar', async () => {
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9000 } });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9500 } });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'delete' });
    await settle(a, b);
    expect((await a.db.conflicts.get(`entry:${ROW_1}`))?.kind).toBe('fields');
    expect((await a.db.entry.get(ROW_1))?.deleted).toBe(true);
    await keepVersion(a.db, 'entry', ROW_1, { amountMinor: 9000 });
    await settle(a, b);
    await both(async (d) => {
      expect(await d.db.entry.get(ROW_1)).toMatchObject({ amountMinor: 9000, deleted: false });
      expect(await d.db.conflicts.count()).toBe(0);
    });
  });

  it('Feldkonflikt mit gleichzeitigem Löschen: confirmDelete lässt gelöscht und beendet den Konflikt', async () => {
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9000 } });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9500 } });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'delete' });
    await settle(a, b);
    await confirmDelete(a.db, 'entry', ROW_1, { amountMinor: 9000 });
    await settle(a, b);
    await both(async (d) => {
      expect(await d.db.entry.get(ROW_1)).toMatchObject({ deleted: true, conflict: false });
      expect(await d.db.conflicts.count()).toBe(0);
    });
  });

  it('keepVersion sortiert auch bei vorgehender Uhr des Partners (2 Tage) hinter alle Köpfe', async () => {
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9000 } });
    b.now += 2 * 86_400_000;
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9500 } });
    await settle(a, b);
    await keepVersion(a.db, 'entry', ROW_1, { amountMinor: 9000 });
    await settle(a, b);
    await both(async (d) => {
      expect(await d.db.entry.get(ROW_1)).toMatchObject({ amountMinor: 9000, conflict: false });
      expect(await d.db.conflicts.count()).toBe(0);
    });
  });

  it('Geldsatz kommt aus dem jüngsten Kopf der Seite: spätere Währungsänderung (eigenes Ereignis) geht nicht verloren', async () => {
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9000 } });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9500 } });
    await write(b, {
      entity: 'entry',
      rowId: ROW_1,
      op: 'update',
      data: {
        currency: 'EUR',
        fxRateMicro: 1_500_000,
        fxRateDate: '2027-01-04',
        fxProvisional: false,
      },
    });
    await settle(a, b);
    const conflict = await b.db.conflicts.get(`entry:${ROW_1}`);
    const versions = await versionsFor(b);
    const mine = versions.find((v) => v.author === B.userId);
    expect(mine?.values).toMatchObject({
      amountMinor: 9500,
      currency: 'EUR',
      fxRateMicro: 1_500_000,
    });
    expect(differingFields(conflict as never, versions)).toContain('currency');
    await keepVersion(b.db, 'entry', ROW_1, keptValues(conflict as never, mine as never, versions));
    await settle(a, b);
    await both(async (d) => {
      expect(await d.db.conflicts.count()).toBe(0);
      expect(await d.db.entry.get(ROW_1)).toMatchObject({
        amountMinor: 9500,
        currency: 'EUR',
        fxRateMicro: 1_500_000,
        conflict: false,
      });
    });
  });

  it('Auto-Auflösen eines Nur-Kursdatum-Konflikts schreibt nur strittige Felder: gleichzeitige Betragsänderung bleibt konfliktfrei', async () => {
    await write(a, {
      entity: 'entry',
      rowId: ROW_1,
      op: 'update',
      data: { fxRateDate: '2027-01-03' },
    });
    await write(b, {
      entity: 'entry',
      rowId: ROW_1,
      op: 'update',
      data: { fxRateDate: '2027-01-04' },
    });
    await settle(a, b);
    const conflict = await a.db.conflicts.get(`entry:${ROW_1}`);
    const versions = await versionsFor(a);
    const latest = versions.at(-1) as (typeof versions)[number];
    const data = keptValues(conflict as never, latest, versions);
    expect(Object.keys(data)).toEqual(['fxRateDate']);
    await keepVersion(a.db, 'entry', ROW_1, data);
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 4242 } });
    await settle(a, b);
    await both(async (d) => {
      expect(await d.db.conflicts.count()).toBe(0);
      expect(await d.db.entry.get(ROW_1)).toMatchObject({ amountMinor: 4242, conflict: false });
    });
  });

  it('Löschen gegen Bearbeiten: restoreRow stellt auf beiden Geräten her', async () => {
    await write(a, { entity: 'fixedCost', rowId: FIXED, op: 'delete' });
    await write(b, {
      entity: 'fixedCost',
      rowId: FIXED,
      op: 'update',
      data: { amountMinor: 1700 },
    });
    await settle(a, b);
    expect((await b.db.conflicts.get(`fixedCost:${FIXED}`))?.kind).toBe('deleteVsEdit');
    await restoreRow(b.db, 'fixedCost', FIXED);
    await settle(a, b);
    await both(async (d) => {
      expect(await d.db.conflicts.count()).toBe(0);
      expect(await d.db.fixedCost.get(FIXED)).toMatchObject({ deleted: false, amountMinor: 1700 });
    });
  });

  it('Löschen gegen Bearbeiten: confirmDelete lässt gelöscht, Konflikt weg', async () => {
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'delete' });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { note: 'x' } });
    await settle(a, b);
    await confirmDelete(a.db, 'entry', ROW_1);
    await settle(a, b);
    await both(async (d) => {
      expect(await d.db.conflicts.count()).toBe(0);
      expect(await d.db.entry.get(ROW_1)).toMatchObject({ deleted: true, conflict: false });
    });
  });
});
