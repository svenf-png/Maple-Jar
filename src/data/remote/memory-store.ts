import {
  AuthError,
  ConflictError,
  NetworkError,
  NoAccessError,
  type RemoteFile,
  type RemoteStore,
} from './remote-store';

export type SimulatedFailure = 'conflict' | 'offline' | 'auth';

export interface MemoryStoreOptions {
  login?: string;
  files?: Record<string, string>;
  /** Wenn false, wirft checkRepoAccess NoAccessError. */
  accessible?: boolean;
}

let shaCounter = 0;
const nextSha = (): string => `sha-${(++shaCounter).toString(16).padStart(8, '0')}`;

export class MemoryStore implements RemoteStore {
  readonly #files = new Map<string, { sha: string; text: string }>();
  readonly #login: string;
  readonly #accessible: boolean;
  #head = nextSha();
  #seenHead: string | null = null;
  #failures: SimulatedFailure[] = [];
  #offline = false;
  #authOk: boolean;

  constructor(options: MemoryStoreOptions = {}) {
    this.#login = options.login ?? 'person-a';
    this.#accessible = options.accessible ?? true;
    this.#authOk = true;
    for (const [path, text] of Object.entries(options.files ?? {})) {
      this.#files.set(path, { sha: nextSha(), text });
    }
  }

  /** Der nächste Aufruf schlägt fehl (`conflict` nur bei writeFile). */
  failNext(kind: SimulatedFailure): void {
    this.#failures.push(kind);
  }

  setOffline(offline: boolean): void {
    this.#offline = offline;
  }

  setAuthValid(valid: boolean): void {
    this.#authOk = valid;
  }

  #guard(forWrite = false): void {
    if (this.#offline) throw new NetworkError();
    if (!this.#authOk) throw new AuthError();
    const next = this.#failures[0];
    if (next === undefined) return;
    if (next === 'conflict') {
      if (!forWrite) return;
      this.#failures.shift();
      throw new ConflictError();
    }
    this.#failures.shift();
    throw next === 'offline' ? new NetworkError() : new AuthError();
  }

  async whoAmI(): Promise<{ login: string }> {
    this.#guard();
    return { login: this.#login };
  }

  async checkRepoAccess(): Promise<void> {
    this.#guard();
    if (!this.#accessible) throw new NoAccessError();
  }

  async headCommit(): Promise<{ sha: string; changed: boolean }> {
    this.#guard();
    const changed = this.#seenHead !== this.#head;
    this.#seenHead = this.#head;
    return { sha: this.#head, changed };
  }

  async listFiles(prefix = ''): Promise<Array<{ path: string; sha: string }>> {
    this.#guard();
    return [...this.#files.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, f]) => ({ path, sha: f.sha }));
  }

  async readFile(path: string): Promise<RemoteFile | null> {
    this.#guard();
    const f = this.#files.get(path);
    return f ? { path, sha: f.sha, text: f.text } : null;
  }

  async writeFile(
    path: string,
    text: string,
    prevSha: string | null,
    _message: string,
  ): Promise<{ sha: string }> {
    this.#guard(true);
    const existing = this.#files.get(path);
    if ((existing?.sha ?? null) !== prevSha) throw new ConflictError();
    const sha = nextSha();
    this.#files.set(path, { sha, text });
    this.#head = nextSha();
    return { sha };
  }
}
