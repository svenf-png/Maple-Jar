import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeSupabase } from './fake-supabase';
import { MemoryServer, type MemoryTransport } from './memory-transport';
import { SupabaseTransport } from './supabase-transport';
import {
  AuthError,
  ForbiddenError,
  type HouseholdInput,
  type SyncTransport,
  type WireEvent,
} from './sync-transport';

const ORIGIN = 'https://contract-test.supabase.co';
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
const C = {
  username: 'person-c',
  password: 'pw-c-12345',
  userId: '00000000-0000-4000-8000-0000000000c1',
};

const input: HouseholdInput = {
  displayName: 'Person A',
  color: '#2C6CB0',
  locale: 'de-DE',
  settings: {
    name: 'Testhaushalt',
    placeLabel: null,
    periodStart: '2027-01-01',
    periodEnd: '2027-12-31',
    baseCurrency: 'CAD',
    secondCurrency: 'EUR',
    fxProvider: 'ECB',
  },
};

let n = 0;
const event = (author: string, over: Partial<WireEvent> = {}): WireEvent => ({
  v: 1,
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  hlc: `2027-01-01T12:00:00.000Z-0000-00000000-0000-4000-8000-0000000000d1`,
  device: '00000000-0000-4000-8000-0000000000d1',
  author,
  entity: 'category',
  rowId: '00000000-0000-4000-8000-0000000000f1',
  op: 'create',
  base: [],
  data: { name: 'Lebensmittel' },
  ...over,
});

interface Harness {
  server: MemoryServer;
  /** Neuer, noch nicht angemeldeter Client */
  client(): SyncTransport;
}

const harnesses: Array<[string, () => Harness]> = [
  [
    'MemoryTransport',
    () => {
      const server = new MemoryServer([A, B, C]);
      return { server, client: () => server.client() as MemoryTransport };
    },
  ],
  [
    'SupabaseTransport (gemocktes fetch)',
    () => {
      const server = new MemoryServer([A, B, C]);
      const fake = createFakeSupabase(server, ORIGIN);
      return {
        server,
        client: () =>
          new SupabaseTransport({
            projectUrl: ORIGIN,
            anonKey: 'anon-test',
            fetchImpl: fake.fetch,
          }),
      };
    },
  ],
];

describe.each(harnesses)('SyncTransport-Vertrag: %s', (_name, make) => {
  let h: Harness;
  beforeEach(() => {
    h = make();
  });

  async function login(u: typeof A): Promise<SyncTransport> {
    const t = h.client();
    await t.signIn(u.username, u.password);
    return t;
  }

  it('signIn liefert Tokens und Benutzer-ID, falsches Passwort wirft AuthError', async () => {
    const session = await h.client().signIn(A.username, A.password);
    expect(session.userId).toBe(A.userId);
    expect(session.accessToken).not.toBe('');
    await expect(h.client().signIn(A.username, 'falsch')).rejects.toBeInstanceOf(AuthError);
    await expect(h.client().signIn('niemand', 'x')).rejects.toBeInstanceOf(AuthError);
  });

  it('refresh rotiert den Refresh-Token; der alte ist danach ungültig', async () => {
    const t = h.client();
    const first = await t.signIn(A.username, A.password);
    const second = await t.refresh();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.userId).toBe(A.userId);
  });

  it('Status und Haushalt: nicht eingerichtet → einrichten → beitreten', async () => {
    const a = await login(A);
    expect(await a.getStatus()).toEqual({ exists: false, memberCount: 0, isMember: false });
    expect(await a.getHousehold()).toBeNull();

    const created = await a.createHousehold(input);
    expect(created.members).toHaveLength(1);
    expect(created.members[0]?.userId).toBe(A.userId);
    expect(created.members[0]?.username).toBe('person-a');
    expect(created.settings.name).toBe('Testhaushalt');
    expect(await a.getStatus()).toEqual({ exists: true, memberCount: 1, isMember: true });

    const b = await login(B);
    expect(await b.getStatus()).toEqual({ exists: true, memberCount: 1, isMember: false });
    expect(await b.getHousehold()).toBeNull();
    const joined = await b.joinHousehold({
      displayName: 'Person B',
      color: '#A2456E',
      locale: 'en-CA',
    });
    expect(joined.members.map((m) => m.username)).toEqual(['person-a', 'person-b']);

    const c = await login(C);
    expect(await c.getStatus()).toEqual({ exists: true, memberCount: 2, isMember: false });
    await expect(
      c.joinHousehold({ displayName: 'X', color: '#2C6CB0', locale: 'de-DE' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('ein zweites Einrichten und ein doppelter Beitritt werden abgelehnt', async () => {
    const a = await login(A);
    await a.createHousehold(input);
    await expect(a.createHousehold(input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      a.joinHousehold({ displayName: 'A', color: '#2C6CB0', locale: 'de-DE' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('pushEvents ist idempotent, Duplikate erzeugen keine zweite Zeile', async () => {
    const a = await login(A);
    await a.createHousehold(input);
    const e1 = event(A.userId);
    const e2 = event(A.userId, { op: 'update', data: { name: 'Neu' } });
    await a.pushEvents([e1, e2]);
    await a.pushEvents([e1, e2]);
    await a.pushEvents([]);
    const pulled = await a.pullEvents(0, 100);
    expect(pulled.map((e) => e.id)).toEqual([e1.id, e2.id]);
    expect(pulled[0]?.seq).toBeLessThan(pulled[1]?.seq ?? 0);
    expect(pulled[0]).toMatchObject({
      rowId: e1.rowId,
      entity: 'category',
      op: 'create',
      base: [],
    });
    expect(pulled[1]?.data).toEqual({ name: 'Neu' });
  });

  it('pullEvents liest ab Cursor und begrenzt nach limit', async () => {
    const a = await login(A);
    await a.createHousehold(input);
    const all = Array.from({ length: 7 }, () => event(A.userId));
    await a.pushEvents(all);
    const page1 = await a.pullEvents(0, 3);
    expect(page1).toHaveLength(3);
    const page2 = await a.pullEvents(page1[2]?.seq ?? 0, 3);
    const page3 = await a.pullEvents(page2[2]?.seq ?? 0, 3);
    expect([...page1, ...page2, ...page3].map((e) => e.id)).toEqual(all.map((e) => e.id));
    expect(page3).toHaveLength(1);
    expect(await a.pullEvents(page3[0]?.seq ?? 0, 3)).toEqual([]);
  });

  it('Ereignisse mit fremdem author und Zugriffe von Nicht-Mitgliedern sind verboten', async () => {
    const a = await login(A);
    await a.createHousehold(input);
    await expect(a.pushEvents([event(B.userId)])).rejects.toBeInstanceOf(ForbiddenError);
    const b = await login(B);
    await expect(b.pushEvents([event(B.userId)])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(b.pullEvents(0, 10)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('beide Mitglieder sehen dieselben Ereignisse', async () => {
    const a = await login(A);
    await a.createHousehold(input);
    const b = await login(B);
    await b.joinHousehold({ displayName: 'Person B', color: '#A2456E', locale: 'de-DE' });
    await a.pushEvents([event(A.userId)]);
    await b.pushEvents([event(B.userId)]);
    expect((await a.pullEvents(0, 10)).map((e) => e.author)).toEqual([A.userId, B.userId]);
    expect((await b.pullEvents(0, 10)).map((e) => e.author)).toEqual([A.userId, B.userId]);
  });
});
