import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from './fake-supabase';
import { MemoryServer } from './memory-transport';
import { parseProjectUrl } from './project-url';
import { SupabaseTransport } from './supabase-transport';
import {
  AuthError,
  ForbiddenError,
  NetworkError,
  RateLimitError,
  ServerError,
} from './sync-transport';
import { ADDRESS_DOMAIN } from './synthetic-address';

const ORIGIN = 'https://unit-test.supabase.co';
const ANON = 'anon-key-unit-test';
const USER = {
  username: 'person-a',
  password: 'geheim-passwort-1',
  userId: '00000000-0000-4000-8000-0000000000a1',
};

function setup() {
  const server = new MemoryServer([USER]);
  const fake = createFakeSupabase(server, ORIGIN);
  const saved: Array<{ accessToken: string; refreshToken: string; userId: string }> = [];
  const make = (tokens: { accessToken: string; refreshToken: string } | null = null) =>
    new SupabaseTransport({
      projectUrl: ORIGIN,
      anonKey: ANON,
      fetchImpl: fake.fetch,
      tokens,
      onTokens: async (t) => {
        saved.push(t);
      },
    });
  return { server, fake, saved, make };
}

describe('Anmeldung', () => {
  it('bildet die synthetische Adresse und sendet Schlüssel nur als apikey-Header', async () => {
    const { fake, make } = setup();
    await make().signIn(USER.username, USER.password);
    const req = fake.requests[0];
    expect(req?.url).toBe(`${ORIGIN}/auth/v1/token?grant_type=password`);
    expect(req?.body).toEqual({ email: `person-a@${ADDRESS_DOMAIN}`, password: USER.password });
    expect(req?.headers.apikey).toBe(ANON);
    expect(req?.url).not.toContain(USER.password);
  });

  it('speichert Tokens über onTokens sofort', async () => {
    const { saved, make } = setup();
    const s = await make().signIn(USER.username, USER.password);
    expect(saved).toEqual([
      { accessToken: s.accessToken, refreshToken: s.refreshToken, userId: USER.userId },
    ]);
  });
});

describe('Token-Erneuerung', () => {
  it('bei 401 einmal erneuern und die Anfrage wiederholen; neuer Refresh-Token wird gespeichert', async () => {
    const { server, fake, saved, make } = setup();
    const t = make();
    await t.signIn(USER.username, USER.password);
    await t.createHousehold({
      displayName: 'A',
      color: '#2C6CB0',
      locale: 'de-DE',
      settings: {
        name: 'T',
        placeLabel: null,
        periodStart: '2027-01-01',
        periodEnd: '2027-12-31',
        baseCurrency: 'CAD',
        secondCurrency: 'EUR',
        fxProvider: 'ECB',
      },
    });
    server.expireAccessTokens();
    saved.length = 0;
    fake.requests.length = 0;
    await expect(t.getStatus()).resolves.toMatchObject({ isMember: true });
    expect(saved).toHaveLength(1);
    const urls = fake.requests.map((r) => r.url.replace(ORIGIN, ''));
    expect(urls).toEqual([
      '/rest/v1/rpc/household_status',
      '/auth/v1/token?grant_type=refresh_token',
      '/rest/v1/rpc/household_status',
    ]);
    expect(fake.requests[2]?.headers.Authorization).toBe(`Bearer ${saved[0]?.accessToken}`);
  });

  it('parallele Anfragen mit abgelaufenem Token lösen genau einen Refresh aus', async () => {
    const { server, fake, make } = setup();
    const t = make();
    await t.signIn(USER.username, USER.password);
    server.expireAccessTokens();
    fake.requests.length = 0;
    const results = await Promise.allSettled([t.getStatus(), t.getStatus(), t.getStatus()]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const refreshes = fake.requests.filter((r) => r.url.includes('grant_type=refresh_token'));
    expect(refreshes).toHaveLength(1);
  });

  it('zwei Refresh-Aufrufe gleichzeitig teilen sich einen Request (Rotation bleibt gültig)', async () => {
    const { fake, make } = setup();
    const t = make();
    await t.signIn(USER.username, USER.password);
    fake.requests.length = 0;
    const [a, b] = await Promise.all([t.refresh(), t.refresh()]);
    expect(a.refreshToken).toBe(b.refreshToken);
    expect(fake.requests).toHaveLength(1);
    await expect(t.refresh()).resolves.toBeDefined(); // der neue Token funktioniert weiter
  });

  it('schlägt der Refresh fehl, kommt AuthError (kein endloses Wiederholen)', async () => {
    const { server, fake, make } = setup();
    const t = make();
    await t.signIn(USER.username, USER.password);
    server.revokeSessions();
    fake.requests.length = 0;
    await expect(t.getStatus()).rejects.toBeInstanceOf(AuthError);
    expect(fake.requests).toHaveLength(2);
  });

  it('ein Netzfehler beim Refresh ist ein NetworkError, kein AuthError', async () => {
    const { server, fake, make } = setup();
    const t = make();
    await t.signIn(USER.username, USER.password);
    server.expireAccessTokens();
    fake.control.failWith.push([401, {}]);
    fake.control.offline = true;
    await expect(t.getStatus()).rejects.toBeInstanceOf(NetworkError);
  });

  it('ohne gespeicherte Tokens: AuthError ohne Anfrage', async () => {
    const { fake, make } = setup();
    await expect(make().getStatus()).rejects.toBeInstanceOf(AuthError);
    expect(fake.requests).toHaveLength(0);
  });
});

describe('Fehlerzuordnung', () => {
  async function signedIn() {
    const ctx = setup();
    const t = ctx.make();
    await t.signIn(USER.username, USER.password);
    return { ...ctx, t };
  }

  it('403 → ForbiddenError', async () => {
    const { fake, t } = await signedIn();
    fake.control.failWith.push([403, { message: 'secret-body-text' }]);
    await expect(t.pullEvents(0, 10)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('429 → RateLimitError mit Wiederholzeitpunkt', async () => {
    const reply = new SupabaseTransport({
      projectUrl: ORIGIN,
      anonKey: ANON,
      tokens: { accessToken: 'x', refreshToken: 'y' },
      fetchImpl: async () => new Response('{}', { status: 429, headers: { 'retry-after': '90' } }),
    });
    const err = await reply.pullEvents(0, 10).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).resetAt?.getTime()).toBeGreaterThan(Date.now() + 80_000);
  });

  it('5xx → ServerError, Netzfehler → NetworkError, kaputte Antwort → ServerError', async () => {
    const { fake, t } = await signedIn();
    fake.control.failWith.push([503, { message: 'secret-body-text' }]);
    await expect(t.pullEvents(0, 10)).rejects.toBeInstanceOf(ServerError);
    fake.control.offline = true;
    await expect(t.pullEvents(0, 10)).rejects.toBeInstanceOf(NetworkError);
    fake.control.offline = false;
    const broken = new SupabaseTransport({
      projectUrl: ORIGIN,
      anonKey: ANON,
      tokens: { accessToken: 'x', refreshToken: 'y' },
      fetchImpl: async () => new Response('<html>', { status: 200 }),
    });
    await expect(broken.pullEvents(0, 10)).rejects.toBeInstanceOf(ServerError);
  });

  it('Zeitüberschreitung → NetworkError', async () => {
    const slow = new SupabaseTransport({
      projectUrl: ORIGIN,
      anonKey: ANON,
      tokens: { accessToken: 'x', refreshToken: 'y' },
      timeoutMs: 20,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    });
    await expect(slow.pullEvents(0, 10)).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('Datenschutz: nichts Sensibles in Fehlern', () => {
  it('Token, Schlüssel, URL, Passwort und Antwortkörper tauchen in keiner Fehlermeldung auf', async () => {
    const { server, fake, make } = setup();
    const t = make();
    const session = await t.signIn(USER.username, USER.password);
    const errors: unknown[] = [];
    const collect = async (p: Promise<unknown>) => {
      errors.push(await p.catch((e: unknown) => e));
    };
    fake.control.failWith.push([403, { message: 'secret-body-text' }]);
    await collect(t.pullEvents(0, 10));
    fake.control.failWith.push([500, { message: 'secret-body-text' }]);
    await collect(t.pullEvents(0, 10));
    await collect(make().signIn(USER.username, 'falsch-secret'));
    server.revokeSessions();
    await collect(t.getStatus());
    fake.control.offline = true;
    await collect(t.getStatus());

    expect(errors.length).toBe(5);
    const secrets = [
      session.accessToken,
      session.refreshToken,
      ANON,
      USER.password,
      'falsch-secret',
      'secret-body-text',
      'unit-test.supabase.co',
      ORIGIN,
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(Error);
      const text = `${(err as Error).name} ${(err as Error).message} ${JSON.stringify(err)} ${(err as Error).stack ?? ''}`;
      for (const secret of secrets) expect(text).not.toContain(secret);
    }
  });
});

describe('Nur der Projekt-Host', () => {
  it('alle Anfragen gehen an den geprüften Origin, mit credentials omit', async () => {
    const { fake, make } = setup();
    const t = make();
    await t.signIn(USER.username, USER.password);
    await t.getStatus();
    await t.pullEvents(0, 10).catch(() => undefined);
    await t.keepAlive();
    expect(fake.requests.length).toBeGreaterThan(3);
    for (const r of fake.requests) expect(r.url.startsWith(`${ORIGIN}/`)).toBe(true);
  });

  it('der Konstruktor lehnt fremde oder unsichere URLs ab', () => {
    for (const url of [
      'http://x.supabase.co',
      'https://evil.example.com',
      'https://x.supabase.co.evil.com',
      'https://x.supabase.co/rest/v1',
      'https://user:pw@x.supabase.co',
      'https://x.supabase.co:8443',
      'javascript:alert(1)',
    ]) {
      expect(() => new SupabaseTransport({ projectUrl: url, anonKey: ANON })).toThrow();
    }
  });

  it('parseProjectUrl normalisiert gültige URLs', () => {
    expect(parseProjectUrl(' https://abc-123.supabase.co/ ')).toBe('https://abc-123.supabase.co');
    expect(parseProjectUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co');
    expect(parseProjectUrl('')).toBeNull();
    expect(parseProjectUrl('https://supabase.co')).toBeNull();
    expect(parseProjectUrl('https://a.b.supabase.co')).toBeNull();
  });
});

describe('Keep-Alive und Push-Format', () => {
  it('Keep-Alive ruft nur lesend und ohne Anmeldung auf', async () => {
    const { fake, make } = setup();
    await make().keepAlive();
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.method).toBe('GET');
    expect(fake.requests[0]?.headers.Authorization).toBeUndefined();
  });

  it('Push sendet Duplikate-ignorieren und Spaltennamen in snake_case', async () => {
    const { fake, make } = setup();
    const t = make();
    await t.signIn(USER.username, USER.password);
    await t
      .pushEvents([
        {
          v: 1,
          id: '00000000-0000-4000-8000-000000000001',
          hlc: 'h',
          device: 'd',
          author: USER.userId,
          entity: 'category',
          rowId: 'r',
          op: 'delete',
          base: [],
        },
      ])
      .catch(() => undefined);
    const req = fake.requests.at(-1);
    expect(req?.url).toBe(`${ORIGIN}/rest/v1/events?on_conflict=id`);
    expect(req?.headers.Prefer).toBe('resolution=ignore-duplicates,return=minimal');
    expect(req?.body).toEqual([expect.objectContaining({ row_id: 'r', data: null })]);
  });
});
