export interface RemoteFile {
  path: string;
  sha: string;
  text: string;
}

export interface RemoteStore {
  whoAmI(): Promise<{ login: string }>;
  /** Wirft NoAccessError, wenn das Repo nicht erreichbar ist. */
  checkRepoAccess(): Promise<void>;
  /** changed=false bei 304 (unverändert seit dem letzten Aufruf). */
  headCommit(): Promise<{ sha: string; changed: boolean }>;
  listFiles(prefix?: string): Promise<Array<{ path: string; sha: string }>>;
  readFile(path: string): Promise<RemoteFile | null>;
  writeFile(
    path: string,
    text: string,
    prevSha: string | null,
    message: string,
  ): Promise<{ sha: string }>;
}

export class AuthError extends Error {
  override name = 'AuthError';
  constructor() {
    super('Authentication failed');
  }
}

export class NoAccessError extends Error {
  override name = 'NoAccessError';
  constructor() {
    super('Repository not accessible');
  }
}

export class RateLimitError extends Error {
  override name = 'RateLimitError';
  /** Zeitpunkt, ab dem wieder Anfragen möglich sind (oder null, wenn unbekannt). */
  readonly resetAt: Date | null;
  constructor(resetAt: Date | null) {
    super('Rate limit exceeded');
    this.resetAt = resetAt;
  }
}

export class ConflictError extends Error {
  override name = 'ConflictError';
  constructor() {
    super('File changed remotely');
  }
}

export class NetworkError extends Error {
  override name = 'NetworkError';
  constructor() {
    super('Network unavailable');
  }
}
