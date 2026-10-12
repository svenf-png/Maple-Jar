import { base64ToUtf8, utf8ToBase64 } from './base64';

export interface FakeGitHubOptions {
  token: string;
  login?: string;
  repo?: string;
  repoAccessible?: boolean;
  files?: Record<string, string>;
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}

/** Minimale Nachbildung der benötigten GitHub-Endpunkte für Tests mit gemocktem fetch. */
export function createFakeGitHub(opts: FakeGitHubOptions) {
  const repo = opts.repo ?? 'org-x/repo-y';
  const files = new Map<string, { sha: string; text: string }>();
  let counter = 0;
  const nextSha = () => `sha${(++counter).toString(16).padStart(6, '0')}`;
  for (const [p, text] of Object.entries(opts.files ?? {})) files.set(p, { sha: nextSha(), text });
  let head = nextSha();
  const requests: RecordedRequest[] = [];

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : null;
    requests.push({ url: url.toString(), method, headers, body });

    if (headers.get('authorization') !== `Bearer ${opts.token}`) {
      return json(401, { message: 'Bad credentials' });
    }
    const path = decodeURIComponent(url.pathname);
    if (path === '/user') return json(200, { login: opts.login ?? 'person-a' });
    const base = `/repos/${repo}`;
    if (!path.startsWith(base) || opts.repoAccessible === false) {
      return json(404, { message: 'Not Found' });
    }
    const rest = path.slice(base.length);
    if (rest === '') return json(200, { full_name: repo });
    if (rest === '/git/ref/heads/main') {
      const etag = `"${head}"`;
      if (headers.get('if-none-match') === etag) return new Response(null, { status: 304 });
      return json(200, { object: { sha: head } }, { etag });
    }
    if (rest.startsWith('/git/trees/')) {
      return json(200, {
        tree: [
          { path: 'some-dir', type: 'tree', sha: 'tree1' },
          ...[...files.entries()].map(([p, f]) => ({ path: p, type: 'blob', sha: f.sha })),
        ],
      });
    }
    if (rest.startsWith('/contents/')) {
      const file = rest.slice('/contents/'.length);
      const existing = files.get(file);
      if (method === 'GET') {
        if (!existing) return json(404, { message: 'Not Found' });
        return json(200, {
          sha: existing.sha,
          content: utf8ToBase64(existing.text),
          encoding: 'base64',
        });
      }
      if (method === 'PUT') {
        const payload = JSON.parse(body ?? '{}') as { content: string; sha?: string };
        if (existing && !payload.sha) return json(422, { message: 'sha was not supplied' });
        if (existing && payload.sha !== existing.sha)
          return json(409, { message: 'does not match' });
        if (!existing && payload.sha) return json(422, { message: 'sha supplied for new file' });
        const sha = nextSha();
        files.set(file, { sha, text: base64ToUtf8(payload.content) });
        head = nextSha();
        return json(200, { content: { sha } });
      }
    }
    return json(404, { message: 'Not Found' });
  };

  return { fetch: fetchImpl, requests, files };
}
