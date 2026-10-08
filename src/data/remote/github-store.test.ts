import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64ToUtf8, utf8ToBase64 } from './base64';
import { createFakeGitHub } from './fake-github';
import { GitHubStore } from './github-store';
import {
  AuthError,
  ConflictError,
  NetworkError,
  NoAccessError,
  RateLimitError,
} from './remote-store';

const TOKEN = 'ghp_SECRET-TOKEN-123';

afterEach(() => vi.unstubAllGlobals());

const mockResponse = (status: number, headers: Record<string, string> = {}, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));

describe('Base64 und UTF-8', () => {
  it('Roundtrip mit Umlauten und Emoji', () => {
    const s = 'Größe: äöüÄÖÜß, 🍁 and 日本語';
    expect(base64ToUtf8(utf8ToBase64(s))).toBe(s);
  });

  it('kodiert wie die Referenz (Buffer)', () => {
    const s = 'Grüße 🍁';
    expect(utf8ToBase64(s)).toBe(Buffer.from(s, 'utf8').toString('base64'));
  });

  it('toleriert Zeilenumbrüche im Base64 der API', () => {
    const b64 = Buffer.from('Grüße', 'utf8').toString('base64');
    expect(base64ToUtf8(`${b64.slice(0, 4)}\n${b64.slice(4)}\n`)).toBe('Grüße');
  });
});

describe('GitHubStore: Anfragen', () => {
  it('sendet Authorization nur an api.github.com', async () => {
    const fake = createFakeGitHub({ token: TOKEN, files: { 'a.txt': 'x' } });
    vi.stubGlobal('fetch', fake.fetch);
    const store = new GitHubStore('org-x/repo-y', TOKEN);
    await store.whoAmI();
    await store.checkRepoAccess();
    await store.readFile('a.txt');
    await store.listFiles();
    expect(fake.requests.length).toBeGreaterThan(0);
    for (const r of fake.requests) {
      expect(new URL(r.url).host).toBe('api.github.com');
      expect(r.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
      expect(r.headers.get('accept')).toBe('application/vnd.github+json');
    }
  });

  it('kodiert Pfadsegmente einzeln', async () => {
    const fake = createFakeGitHub({ token: TOKEN });
    vi.stubGlobal('fetch', fake.fetch);
    const store = new GitHubStore('org-x/repo-y', TOKEN);
    await store.writeFile('log/dev ice/2027-01 äö.jsonl', 'x', null, 'm');
    const put = fake.requests.find((r) => r.method === 'PUT');
    expect(put?.url).toContain('/contents/log/dev%20ice/2027-01%20%C3%A4%C3%B6.jsonl');
  });

  it('sendet beim Anlegen kein sha und beim Ändern die sha', async () => {
    const fake = createFakeGitHub({ token: TOKEN });
    vi.stubGlobal('fetch', fake.fetch);
    const store = new GitHubStore('org-x/repo-y', TOKEN);
    const { sha } = await store.writeFile('a.txt', 'Grüße 🍁', null, 'chore: x');
    await store.writeFile('a.txt', 'neu', sha, 'chore: y');
    const puts = fake.requests
      .filter((r) => r.method === 'PUT')
      .map((r) => JSON.parse(r.body ?? ''));
    expect(puts[0]).not.toHaveProperty('sha');
    expect(puts[0].message).toBe('chore: x');
    expect(base64ToUtf8(puts[0].content)).toBe('Grüße 🍁');
    expect(puts[1].sha).toBe(sha);
  });

  it('nutzt If-None-Match und behandelt 304 als unverändert', async () => {
    const fake = createFakeGitHub({ token: TOKEN });
    vi.stubGlobal('fetch', fake.fetch);
    const store = new GitHubStore('org-x/repo-y', TOKEN);
    const first = await store.headCommit();
    expect(first.changed).toBe(true);
    const second = await store.headCommit();
    expect(second).toEqual({ sha: first.sha, changed: false });
    const refCalls = fake.requests.filter((r) => r.url.includes('/git/ref/heads/main'));
    expect(refCalls[0]?.headers.get('if-none-match')).toBeNull();
    expect(refCalls[1]?.headers.get('if-none-match')).toMatch(/^"/);
  });

  it('listFiles ignoriert Verzeichnisse (nur blobs)', async () => {
    const fake = createFakeGitHub({ token: TOKEN, files: { 'x/y.txt': '1' } });
    vi.stubGlobal('fetch', fake.fetch);
    const list = await new GitHubStore('org-x/repo-y', TOKEN).listFiles();
    expect(list.map((f) => f.path)).toEqual(['x/y.txt']);
  });
});

describe('GitHubStore: Fehlerzuordnung', () => {
  const store = () => new GitHubStore('org-x/repo-y', TOKEN);

  it('401 → AuthError', async () => {
    vi.stubGlobal('fetch', mockResponse(401));
    await expect(store().whoAmI()).rejects.toBeInstanceOf(AuthError);
  });

  it('404 auf dem Repo → NoAccessError', async () => {
    vi.stubGlobal('fetch', mockResponse(404));
    await expect(store().checkRepoAccess()).rejects.toBeInstanceOf(NoAccessError);
  });

  it('403 mit Rate-Limit-Headern → RateLimitError mit Reset-Zeit', async () => {
    vi.stubGlobal(
      'fetch',
      mockResponse(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' }),
    );
    const err = await store()
      .whoAmI()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).resetAt?.getTime()).toBe(1_800_000_000_000);
  });

  it('429 → RateLimitError', async () => {
    vi.stubGlobal('fetch', mockResponse(429, { 'retry-after': '60' }));
    await expect(store().whoAmI()).rejects.toBeInstanceOf(RateLimitError);
  });

  it('409 und 422 beim Schreiben → ConflictError', async () => {
    vi.stubGlobal('fetch', mockResponse(409));
    await expect(store().writeFile('a', 'x', 'old', 'm')).rejects.toBeInstanceOf(ConflictError);
    vi.stubGlobal('fetch', mockResponse(422));
    await expect(store().writeFile('a', 'x', null, 'm')).rejects.toBeInstanceOf(ConflictError);
  });

  it('fetch-Ausnahme → NetworkError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError(`failed ${TOKEN}`);
      }),
    );
    await expect(store().whoAmI()).rejects.toBeInstanceOf(NetworkError);
  });

  it('der Token taucht in keiner Fehlermeldung auf', async () => {
    const cases: Array<() => Promise<unknown>> = [];
    for (const status of [401, 403, 404, 409, 422, 429, 500]) {
      vi.stubGlobal('fetch', mockResponse(status, {}, { message: `bad ${TOKEN}` }));
      cases.push(() =>
        store()
          .whoAmI()
          .catch((e: unknown) => e),
      );
      cases.push(() =>
        store()
          .writeFile('a', 'x', null, 'm')
          .catch((e: unknown) => e),
      );
      cases.push(() =>
        store()
          .readFile('a')
          .catch((e: unknown) => e),
      );
      for (const c of cases) {
        const err = (await c()) as Error | null;
        if (err instanceof Error) {
          expect(err.message).not.toContain(TOKEN);
          expect(String(err.stack ?? '')).not.toContain(TOKEN);
        }
      }
      cases.length = 0;
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError(`failed ${TOKEN}`);
      }),
    );
    const err = (await store()
      .whoAmI()
      .catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain(TOKEN);
  });

  it('ungültiges Repo-Format wird abgelehnt', () => {
    expect(() => new GitHubStore('kein-slash', TOKEN)).toThrow();
  });
});
