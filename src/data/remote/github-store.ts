import { base64ToUtf8, utf8ToBase64 } from './base64';
import {
  AuthError,
  ConflictError,
  NetworkError,
  NoAccessError,
  RateLimitError,
  type RemoteFile,
  type RemoteStore,
} from './remote-store';

const API = 'https://api.github.com';

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

export class GitHubStore implements RemoteStore {
  readonly #owner: string;
  readonly #repo: string;
  readonly #token: string;
  #refEtag: string | null = null;
  #headSha: string | null = null;

  constructor(repo: string, token: string) {
    const [owner, name] = repo.split('/');
    if (!owner || !name) throw new Error('Invalid repo format');
    this.#owner = owner;
    this.#repo = name;
    this.#token = token;
  }

  get #repoPath(): string {
    return `/repos/${encodeURIComponent(this.#owner)}/${encodeURIComponent(this.#repo)}`;
  }

  async #request(
    method: string,
    path: string,
    opts: { headers?: Record<string, string>; body?: unknown } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#token}`,
      Accept: 'application/vnd.github+json',
      ...opts.headers,
    };
    const init: RequestInit = { method, headers };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, init);
    } catch {
      // Fehlertext des Browsers bewusst nicht übernommen.
      throw new NetworkError();
    }
    return res;
  }

  #fail(res: Response, context: 'repo' | 'file' | 'write' | 'other'): never {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const retryAfter = res.headers.get('retry-after');
    if (res.status === 429 || (res.status === 403 && (remaining === '0' || retryAfter !== null))) {
      const reset = res.headers.get('x-ratelimit-reset');
      let resetAt: Date | null = null;
      if (reset && Number.isFinite(Number(reset))) resetAt = new Date(Number(reset) * 1000);
      else if (retryAfter && Number.isFinite(Number(retryAfter))) {
        resetAt = new Date(Date.now() + Number(retryAfter) * 1000);
      }
      throw new RateLimitError(resetAt);
    }
    if (res.status === 401) throw new AuthError();
    if (res.status === 404 && context === 'repo') throw new NoAccessError();
    if (res.status === 403) throw new NoAccessError();
    if (context === 'write' && (res.status === 409 || res.status === 422)) {
      throw new ConflictError();
    }
    throw new Error(`GitHub request failed (${res.status})`);
  }

  async whoAmI(): Promise<{ login: string }> {
    const res = await this.#request('GET', '/user');
    if (!res.ok) this.#fail(res, 'other');
    const json = (await res.json()) as { login?: unknown };
    if (typeof json.login !== 'string') throw new Error('Unexpected response');
    return { login: json.login };
  }

  async checkRepoAccess(): Promise<void> {
    const res = await this.#request('GET', this.#repoPath);
    if (!res.ok) this.#fail(res, 'repo');
  }

  async headCommit(): Promise<{ sha: string; changed: boolean }> {
    const headers: Record<string, string> = {};
    if (this.#refEtag && this.#headSha) headers['If-None-Match'] = this.#refEtag;
    const res = await this.#request('GET', `${this.#repoPath}/git/ref/heads/main`, { headers });
    if (res.status === 304 && this.#headSha) return { sha: this.#headSha, changed: false };
    if (!res.ok) this.#fail(res, 'repo');
    const json = (await res.json()) as { object?: { sha?: unknown } };
    const sha = json.object?.sha;
    if (typeof sha !== 'string') throw new Error('Unexpected response');
    const changed = sha !== this.#headSha;
    this.#headSha = sha;
    this.#refEtag = res.headers.get('etag');
    return { sha, changed };
  }

  async listFiles(prefix = ''): Promise<Array<{ path: string; sha: string }>> {
    const { sha: commitSha } = await this.headCommit();
    const res = await this.#request(
      'GET',
      `${this.#repoPath}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`,
    );
    if (!res.ok) this.#fail(res, 'repo');
    const json = (await res.json()) as {
      tree?: Array<{ path: string; sha: string; type: string }>;
    };
    return (json.tree ?? [])
      .filter((e) => e.type === 'blob' && e.path.startsWith(prefix))
      .map((e) => ({ path: e.path, sha: e.sha }));
  }

  async readFile(path: string): Promise<RemoteFile | null> {
    const res = await this.#request('GET', `${this.#repoPath}/contents/${encodePath(path)}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) this.#fail(res, 'file');
    const json = (await res.json()) as { sha?: unknown; content?: unknown; encoding?: unknown };
    if (typeof json.sha !== 'string' || typeof json.content !== 'string') {
      throw new Error('Unexpected response');
    }
    return { path, sha: json.sha, text: base64ToUtf8(json.content) };
  }

  async writeFile(
    path: string,
    text: string,
    prevSha: string | null,
    message: string,
  ): Promise<{ sha: string }> {
    const body: Record<string, string> = { message, content: utf8ToBase64(text) };
    if (prevSha) body.sha = prevSha;
    const res = await this.#request('PUT', `${this.#repoPath}/contents/${encodePath(path)}`, {
      body,
    });
    if (!res.ok) this.#fail(res, 'write');
    const json = (await res.json()) as { content?: { sha?: unknown } };
    const sha = json.content?.sha;
    if (typeof sha !== 'string') throw new Error('Unexpected response');
    return { sha };
  }
}
