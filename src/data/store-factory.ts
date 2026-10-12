import { GitHubStore } from './remote/github-store';
import type { RemoteStore } from './remote/remote-store';

let cached: { key: string; store: RemoteStore } | null = null;

/** Liefert pro Repo/Token-Kombination genau eine Store-Instanz. */
export async function getStore(repo: string, token: string): Promise<RemoteStore> {
  const key = `${repo}\u0000${token}`;
  if (cached?.key === key) return cached.store;
  let store: RemoteStore | null = null;
  // Nur im E2E-Build vorhanden: wird im Produktions-Build per Dead-Code-Elimination entfernt.
  if (import.meta.env.VITE_E2E === '1') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('store') === 'memory') {
      const { createE2eStore } = await import('./e2e-store');
      store = createE2eStore(token, params.get('scenario'));
    }
  }
  store ??= new GitHubStore(repo, token);
  cached = { key, store };
  return store;
}

export function resetStoreCache(): void {
  cached = null;
}
