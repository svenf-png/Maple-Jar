import { beforeEach, describe, expect, it } from 'vitest';
import { fixedCostEntryId } from '../../domain/fixed-cost';
import { bookFixedCost, deleteEntry, runAutobook } from '../actions';
import { type EventRow, MapleJarDb } from '../db';
import { CAT_1, categoryData, entryData, ROW_1, uuid } from '../events/test-helpers';
import { exportEventsJson } from '../export';
import type { Household } from '../household';
import { MemoryServer, type MemoryTransport } from '../remote/memory-transport';
import { AuthError, NetworkError } from '../remote/sync-transport';
import { appendLocalEvent } from '../write';
import { runSync } from './cycle';
import { classify } from './engine';
import { catchUpRates } from './fx-catchup';
import { CURSOR_OVERLAP, PAGE_SIZE, pullAll } from './pull';
import { pushOutbox, toWire } from './push';

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

let dbCounter = 0;

interface Device {
  db: MapleJarDb;
  transport: MemoryTransport;
  userId: string;
  deviceId: string;
  now: number;
}

const settings = {
  name: 'Testhaushalt',
  placeLabel: null,
  periodStart: '2027-01-01',
  periodEnd: '2027-12-31',
  baseCurrency: 'CAD',
  secondCurrency: 'EUR',
  fxProvider: 'ECB',
} as const;

async function makeDevice(server: MemoryServer, user: typeof A, deviceId: string): Promise<Device> {
  const db = new MapleJarDb(`sync-test-${++dbCounter}`);
  const transport = server.client();
  await transport.signIn(user.username, user.password);
  await db.meta.bulkPut([
    { key: 'deviceId', value: deviceId },
    { key: 'userId', value: user.userId },
  ]);
  return { db, transport, userId: user.userId, deviceId, now: Date.UTC(2027, 0, 5, 10, 0, 0) };
}

const household = (): Household => ({
  formatVersion: 1,
  householdId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2027-01-01T00:00:00.000Z',
  settings,
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
const waitingCount = async (d: Device) =>
  (((await d.db.meta.get('waiting'))?.value as string[] | undefined) ?? []).length;
const sync = (d: Device) => runSync(d.db, d.transport, { nowMs: d.now });

let server: MemoryServer;
let a: Device;
let b: Device;

beforeEach(async () => {
  server = new MemoryServer([A, B]);
  // Server mit Haushalt und beiden Mitgliedern
  await server.client().signIn(A.username, A.password);
  server.household = { ...household(), members: undefined } as never;
  server.members = household().members;
  a = await makeDevice(server, A, '00000000-0000-4000-8000-0000000000d1');
  b = await makeDevice(server, B, '00000000-0000-4000-8000-0000000000d2');
  await sync(a); // lädt den Haushalt in die lokale Datenbank
  await sync(b);
});

const rowOf = (d: Device, id: string) => d.db.entry.get(id);

describe('Schreiben', () => {
  it('schreibt Ereignis, Outbox und materialisierte Zeile in einer Transaktion', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    expect(await a.db.events.count()).toBe(1);
    expect(await a.db.outbox.count()).toBe(1);
    expect((await a.db.category.get(CAT_1))?.name).toBe('Lebensmittel');
  });

  it('ein ungültiges Ereignis wird abgelehnt und schreibt nichts', async () => {
    await expect(
      write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: { name: '' } }),
    ).rejects.toThrow();
    expect(await a.db.events.count()).toBe(0);
    expect(await a.db.outbox.count()).toBe(0);
  });

  it('Folgeereignisse tragen die Köpfe der Zeile als base, die HLC steigt streng', async () => {
    const e1 = await write(a, {
      entity: 'category',
      rowId: CAT_1,
      op: 'create',
      data: categoryData(),
    });
    const e2 = await write(a, {
      entity: 'category',
      rowId: CAT_1,
      op: 'update',
      data: { name: 'Neu' },
    });
    expect(e2.base).toEqual([e1.id]);
    expect(e2.hlc > e1.hlc).toBe(true);
  });
});

describe('Push und Pull', () => {
  it('ein Ereignis wandert von Gerät A zu Gerät B', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await sync(a);
    expect(await a.db.outbox.count()).toBe(0);
    const r = await sync(b);
    expect(r.pulled).toBe(1);
    expect((await b.db.category.get(CAT_1))?.name).toBe('Lebensmittel');
  });

  it('Cursor wird erst nach Verarbeitung fortgeschrieben', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await sync(a);
    b.transport.setOffline(true);
    await expect(sync(b)).rejects.toBeInstanceOf(NetworkError);
    expect(await b.db.meta.get('cursor')).toBeUndefined();
    b.transport.setOffline(false);
    await sync(b);
    expect((await b.db.meta.get('cursor'))?.value).toBeGreaterThan(0);
  });

  it('Wiederholung nach Fehler: Outbox bleibt, nichts geht doppelt', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    a.transport.failNext(new NetworkError());
    await expect(sync(a)).rejects.toBeInstanceOf(NetworkError);
    expect(await a.db.outbox.count()).toBe(1);
    await sync(a);
    await sync(a);
    expect(await a.db.outbox.count()).toBe(0);
    expect(server.events).toHaveLength(1);
  });

  it('Abbruch mitten im Senden (Antwort verloren): erneutes Senden erzeugt keine Duplikate', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    const ids = (await a.db.outbox.toArray()).map((o) => o.id);
    // Server hat das Ereignis, der Client weiß es nicht (Outbox noch voll)
    const row = await a.db.events.get(ids[0] as string);
    await server.client().signIn(A.username, A.password);
    server.events.push({ ...toWire(row as EventRow), seq: server.nextSeq() });
    await pushOutbox(a.db, a.transport);
    expect(server.events).toHaveLength(1);
    expect(await a.db.outbox.count()).toBe(0);
  });

  it('eigene Ereignisse, die per Pull zurückkommen, räumen die Outbox auf und doppeln nicht', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await pushOutbox(a.db, a.transport); // Outbox leer
    const r = await sync(a);
    expect(r.pulled).toBe(0); // schon bekannt
    expect(await a.db.events.count()).toBe(1);
  });

  it('liest mehr als eine Seite und überlappt am Cursor', async () => {
    const count = PAGE_SIZE + 25;
    const t = server.client();
    await t.signIn(A.username, A.password);
    await t.pushEvents(
      Array.from({ length: count }, (_, i) => ({
        v: 1,
        id: uuid(),
        hlc: `2027-01-01T12:00:00.000Z-${i.toString(16).padStart(4, '0')}-00000000-0000-4000-8000-0000000000d1`,
        device: '00000000-0000-4000-8000-0000000000d1',
        author: A.userId,
        entity: 'category',
        rowId: uuid(),
        op: 'create',
        base: [],
        data: categoryData({ sort: 1 }),
      })),
    );
    const before = server.calls.pullEvents ?? 0;
    expect(await pullAll(b.db, b.transport, b.now)).toBe(count);
    expect((server.calls.pullEvents ?? 0) - before).toBe(2);
    expect(await b.db.category.count()).toBe(count);
    // zweiter Lauf: nichts Neues, Cursor-Überlappung liest nur wenige Zeilen erneut
    expect(await pullAll(b.db, b.transport, b.now)).toBe(0);
    expect(CURSOR_OVERLAP).toBeGreaterThan(0);
  });

  it('ein nachträglich committetes Ereignis mit kleinerer seq wird dank Überlappung nicht übersehen', async () => {
    const t = server.client();
    await t.signIn(A.username, A.password);
    const mkEvent = (n: number) => ({
      v: 1,
      id: uuid(),
      hlc: `2027-01-01T12:00:00.000Z-${n.toString(16).padStart(4, '0')}-00000000-0000-4000-8000-0000000000d1`,
      device: '00000000-0000-4000-8000-0000000000d1',
      author: A.userId,
      entity: 'category' as const,
      rowId: uuid(),
      op: 'create',
      base: [],
      data: categoryData(),
    });
    const late = mkEvent(1);
    const early = mkEvent(2);
    // seq 1 wird vergeben, aber erst nach seq 2 sichtbar
    const s1 = server.nextSeq();
    server.events.push({ ...early, seq: server.nextSeq() });
    await pullAll(b.db, b.transport, b.now);
    server.events.push({ ...late, seq: s1 });
    expect(await pullAll(b.db, b.transport, b.now)).toBe(1);
    expect(await b.db.events.get(late.id)).toBeDefined();
  });

  it('ungültige Ereignisse werden geparkt, nie still verworfen; gültige laufen weiter', async () => {
    const t = server.client();
    await t.signIn(A.username, A.password);
    await t.pushEvents([
      {
        v: 99,
        id: uuid(),
        hlc: 'x',
        device: 'd',
        author: A.userId,
        entity: 'category',
        rowId: 'r',
        op: 'create',
        base: [],
      },
    ]);
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await sync(a);
    await sync(b);
    const parked = await b.db.parked.toArray();
    expect(parked).toHaveLength(1);
    expect(parked[0]?.reason).toContain('envelope');
    expect(await b.db.category.count()).toBe(1);
  });
});

describe('Zwei Geräte', () => {
  it('Offline-Phasen: beide ändern verschiedene Felder → Merge ohne Konflikt', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'create', data: entryData() });
    await sync(a);
    await sync(b);

    // beide offline
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9000 } });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { note: 'Notiz' } });
    await sync(a);
    await sync(b);
    await sync(a);

    for (const d of [a, b]) {
      const row = await rowOf(d, ROW_1);
      expect(row?.amountMinor).toBe(9000);
      expect(row?.note).toBe('Notiz');
      expect(row?.conflict).toBe(false);
    }
  });

  it('gleiches Feld gleichzeitig → Konflikt, beide Geräte zeigen denselben vorläufigen Wert', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'create', data: entryData() });
    await sync(a);
    await sync(b);

    await write(a, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9000 } });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9500 } });
    await sync(a);
    await sync(b);
    await sync(a);

    const ra = await rowOf(a, ROW_1);
    const rb = await rowOf(b, ROW_1);
    expect(ra?.conflict).toBe(true);
    expect(rb?.conflict).toBe(true);
    expect(ra?.amountMinor).toBe(rb?.amountMinor);
    expect(await a.db.conflicts.count()).toBe(1);

    // Auflösung auf A (base = beide Köpfe) beendet den Konflikt auch auf B
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'update', data: { amountMinor: 9000 } });
    await sync(a);
    await sync(b);
    expect((await rowOf(b, ROW_1))?.conflict).toBe(false);
    expect(await b.db.conflicts.count()).toBe(0);
    expect((await rowOf(b, ROW_1))?.amountMinor).toBe(9000);
  });

  it('Eintrag wartet auf eine noch fehlende Kategorie und erscheint, sobald sie eintrifft', async () => {
    // A legt Kategorie und Eintrag an, B bekommt zuerst nur den Eintrag (simuliert durch getrenntes Pushen)
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'create', data: entryData() });
    const all = (await a.db.events.toArray()).sort((x, y) => (x.hlc < y.hlc ? -1 : 1));
    const t = server.client();
    await t.signIn(A.username, A.password);
    await t.pushEvents([toWire(all[1] as EventRow)]);
    await sync(b);
    expect(await b.db.entry.count()).toBe(0);
    expect(await waitingCount(b)).toBe(1);

    await t.pushEvents([toWire(all[0] as EventRow)]);
    await sync(b);
    expect(await b.db.entry.count()).toBe(1);
    expect(await waitingCount(b)).toBe(0);
  });

  it('ein Konflikt-Lösen und Löschen gegen Bearbeiten über zwei Geräte', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'create', data: entryData() });
    await sync(a);
    await sync(b);
    await write(a, { entity: 'entry', rowId: ROW_1, op: 'delete' });
    await write(b, { entity: 'entry', rowId: ROW_1, op: 'update', data: { note: 'edit' } });
    await sync(a);
    await sync(b);
    await sync(a);
    const conflict = await b.db.conflicts.toArray();
    expect(conflict[0]?.kind).toBe('deleteVsEdit');
    expect((await rowOf(a, ROW_1))?.deleted).toBe(true);
    expect((await rowOf(b, ROW_1))?.deleted).toBe(true);
  });
});

describe('Fehlerklassen und Erneuerung', () => {
  it('classify ordnet Fehler zu', () => {
    expect(classify(new AuthError())).toBe('auth');
    expect(classify(new NetworkError())).toBe('network');
    expect(classify(new Error('x'))).toBe('server');
  });

  it('abgelaufene Zugriffstoken werden transparent erneuert', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    server.expireAccessTokens();
    await sync(a);
    expect(server.events).toHaveLength(1);
  });

  it('widerrufene Sitzung → AuthError, Outbox bleibt erhalten', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    server.revokeSessions();
    await expect(sync(a)).rejects.toBeInstanceOf(AuthError);
    expect(await a.db.outbox.count()).toBe(1);
  });
});

describe('Kurse nachziehen', () => {
  it('aktualisiert vorläufige EUR-Einträge nur auf dem erstellenden Gerät', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await write(a, {
      entity: 'entry',
      rowId: ROW_1,
      op: 'create',
      data: entryData({
        currency: 'EUR',
        fxRateMicro: 1_400_000,
        fxRateDate: '2027-01-01',
        fxProvisional: true,
      }),
    });
    await sync(a);
    await sync(b);
    const rate = async () => ({ rateMicro: 1_450_000n, date: '2027-01-02', stale: false });
    expect(await catchUpRates(b.db, rate, '2027-06-01')).toBe(0);
    expect(await catchUpRates(a.db, rate, '2027-06-01')).toBe(1);
    const row = await rowOf(a, ROW_1);
    expect(row).toMatchObject({
      fxRateMicro: 1_450_000,
      fxProvisional: false,
      fxRateDate: '2027-01-02',
    });
    await sync(a);
    await sync(b);
    expect((await rowOf(b, ROW_1))?.fxProvisional).toBe(false);
  });

  it('lässt den Eintrag vorläufig, wenn der Kurs nicht abrufbar oder veraltet ist', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await write(a, {
      entity: 'entry',
      rowId: ROW_1,
      op: 'create',
      data: entryData({ currency: 'EUR', fxRateMicro: 1_400_000, fxProvisional: true }),
    });
    expect(await catchUpRates(a.db, async () => ({ rateMicro: 1n, date: 'x', stale: true }))).toBe(
      0,
    );
    expect(
      await catchUpRates(a.db, async () => {
        throw new Error('offline');
      }),
    ).toBe(0);
    expect((await rowOf(a, ROW_1))?.fxProvisional).toBe(true);
  });

  it('lässt einen Eintrag von heute vorläufig, solange nur ein Kurs eines früheren Tages vorliegt', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await write(a, {
      entity: 'entry',
      rowId: ROW_1,
      op: 'create',
      data: entryData({ currency: 'EUR', fxRateMicro: 1_400_000, fxProvisional: true }),
    });
    const earlier = async () => ({ rateMicro: 1_450_000n, date: '2027-01-01', stale: false });
    expect(await catchUpRates(a.db, earlier, '2027-01-02')).toBe(0);
    expect((await rowOf(a, ROW_1))?.fxProvisional).toBe(true);
    // Ein vergangener Tag (Wochenende, Feiertag): früherer Kurs ist endgültig
    expect(await catchUpRates(a.db, earlier, '2027-01-05')).toBe(1);
    expect((await rowOf(a, ROW_1))?.fxProvisional).toBe(false);
  });
});

describe('Fixkosten-Buchung auf zwei Geräten', () => {
  const FC = uuid();
  const DUE = '2027-01-10';
  async function setup() {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await write(a, {
      entity: 'fixedCost',
      rowId: FC,
      op: 'create',
      data: {
        name: 'Streaming-Abo A',
        amountMinor: 1299,
        currency: 'CAD',
        unit: 'month',
        every: 1,
        startsOn: '2027-01-10',
        categoryId: CAT_1,
        isSaving: false,
        autobook: true,
      },
    });
    await sync(a);
    await sync(b);
    return fixedCostEntryId(FC, DUE);
  }
  async function expectOneEntry(id: string) {
    await sync(a);
    await sync(b);
    await sync(a);
    for (const d of [a, b]) {
      const rows = (await d.db.entry.toArray()).filter((e) => e.id === id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ deleted: false, conflict: false, source: 'fixed' });
      expect((await d.db.entry.toArray()).filter((e) => !e.deleted)).toHaveLength(1);
    }
  }

  it('beide Geräte buchen offline per Autobook: genau ein Eintrag, kein Konflikt', async () => {
    const id = await setup();
    expect(await runAutobook(a.db, null, '2027-01-12')).toBe(1);
    expect(await runAutobook(b.db, null, '2027-01-12')).toBe(1);
    await expectOneEntry(id);
  });

  it('Tipp-Buchung (ohne Override) auf A, Autobook auf B: ein Eintrag, kein Konflikt', async () => {
    const id = await setup();
    expect(await bookFixedCost(a.db, FC, DUE, null)).toBe('booked');
    expect(await runAutobook(b.db, null, '2027-01-12')).toBe(1);
    await expectOneEntry(id);
  });

  it('auf A gelöschte Autobuchung bleibt gelöscht, wenn B erst synchronisiert und dann Autobook läuft', async () => {
    const id = await setup();
    expect(await runAutobook(a.db, null, '2027-01-12')).toBe(1);
    await sync(a);
    await sync(b); // B hat den Eintrag
    await deleteEntry(a.db, id);
    await sync(a);
    await sync(b); // erst Sync, dann Autobook (Reihenfolge der Laufzeit)
    expect(await runAutobook(b.db, null, '2027-01-12')).toBe(0);
    await sync(b);
    await sync(a);
    for (const d of [a, b]) expect((await d.db.entry.get(id))?.deleted).toBe(true);
  });
});

describe('Fixkosten-Buchung: Löschen und Kurse', () => {
  const FC = uuid();
  const DUE = '2027-01-10';
  async function setup(currency: 'CAD' | 'EUR') {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await write(a, {
      entity: 'fixedCost',
      rowId: FC,
      op: 'create',
      data: {
        name: 'Abo A',
        amountMinor: 1299,
        currency,
        unit: 'month',
        every: 1,
        startsOn: DUE,
        categoryId: CAT_1,
        isSaving: false,
        autobook: true,
      },
    });
    await sync(a);
    await sync(b);
    return fixedCostEntryId(FC, DUE);
  }

  it('A löscht vor dem Push, B bucht gleichzeitig denselben Eintrag: bleibt gelöscht', async () => {
    const id = await setup('CAD');
    expect(await runAutobook(a.db, null, '2027-01-12')).toBe(1);
    await deleteEntry(a.db, id); // noch nicht gepusht
    expect(await runAutobook(b.db, null, '2027-01-12')).toBe(1); // B kennt das Löschen nicht
    await sync(a);
    await sync(b);
    await sync(a);
    for (const d of [a, b]) {
      expect(await d.db.entry.get(id)).toMatchObject({ deleted: true, conflict: false });
    }
  });

  it('EUR: gleicher Eintrag mit anderem Kurs auf zwei Geräten ergibt keinen Konflikt, Nachzug heilt', async () => {
    const id = await setup('EUR');
    await runAutobook(
      a.db,
      { rateMicro: 1_500_000n, date: '2027-01-10', stale: false },
      '2027-01-12',
    );
    await runAutobook(
      b.db,
      { rateMicro: 1_480_000n, date: '2027-01-08', stale: true },
      '2027-01-12',
    );
    await sync(a);
    await sync(b);
    await sync(a);
    for (const d of [a, b]) {
      const row = await d.db.entry.get(id);
      expect(row?.conflict).toBe(false);
      expect(await d.db.conflicts.count()).toBe(0);
    }
    const ra = await a.db.entry.get(id);
    const rb = await b.db.entry.get(id);
    expect(ra?.fxRateMicro).toBe(rb?.fxRateMicro); // beide Geräte gleicher Stand
    // Der Kursnachzug des erstellenden Geräts repariert vorläufige Kurse
    if (ra?.fxProvisional) {
      const fixer = ra.createdByDevice === a.deviceId ? a : b;
      const rate = async () => ({ rateMicro: 1_510_000n, date: '2027-01-10', stale: false });
      expect(await catchUpRates(fixer.db, rate, '2027-06-01')).toBe(1);
    }
  });
});

describe('Export', () => {
  it('exportiert alle Ereignisse als JSON, sortiert nach HLC', async () => {
    await write(a, { entity: 'category', rowId: CAT_1, op: 'create', data: categoryData() });
    await write(a, { entity: 'category', rowId: CAT_1, op: 'update', data: { name: 'Neu' } });
    const json = JSON.parse(await exportEventsJson(a.db, new Date('2027-02-01T00:00:00Z')));
    expect(json.format).toBe(1);
    expect(json.exportedAt).toBe('2027-02-01T00:00:00.000Z');
    expect(json.events).toHaveLength(2);
    expect(json.events[0].op).toBe('create');
  });
});
