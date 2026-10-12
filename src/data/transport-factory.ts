import { db, getMeta } from './db';
import { parseProjectUrl } from './remote/project-url';
import type { SyncTransport } from './remote/sync-transport';

let cached: SyncTransport | null = null;

export interface TokenStore {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** Rotierter Refresh-Token wird sofort gespeichert, bevor der nächste Aufruf ihn braucht. */
async function persistTokens(t: TokenStore): Promise<void> {
  await db.meta.bulkPut([
    { key: 'accessToken', value: t.accessToken },
    { key: 'refreshToken', value: t.refreshToken },
    { key: 'userId', value: t.userId },
  ]);
}

/** Nur im E2E-Build vorhanden: im Produktions-Build entfällt dieser Zweig (Dead-Code-Elimination). */
async function e2eTransport(userId: string | null): Promise<SyncTransport | null> {
  if (import.meta.env.VITE_E2E !== '1') return null;
  let scenario: string | null = new URLSearchParams(window.location.search).get('e2e');
  try {
    if (scenario) sessionStorage.setItem('maple-jar.e2e', scenario);
    else scenario = sessionStorage.getItem('maple-jar.e2e');
  } catch {
    // Speicher nicht verfügbar
  }
  if (!scenario) return null;
  const { createE2eTransport } = await import('./e2e-server');
  return createE2eTransport(scenario, userId);
}

/** Frischer Transport für die Anmeldung (noch ohne gespeicherte Tokens). */
export async function createLoginTransport(
  projectUrl: string,
  anonKey: string,
): Promise<SyncTransport> {
  const e2e = await e2eTransport(null);
  let transport = e2e;
  if (!transport) {
    const { SupabaseTransport } = await import('./remote/supabase-transport');
    transport = new SupabaseTransport({
      projectUrl,
      anonKey,
      tokens: null,
      onTokens: persistTokens,
    });
  }
  cached = transport;
  return transport;
}

/** Transport der gespeicherten Sitzung (oder null ohne Sitzung). Pro Seite genau eine Instanz. */
export async function getTransport(): Promise<SyncTransport | null> {
  if (cached) return cached;
  const [projectUrl, anonKey, accessToken, refreshToken, userId] = await Promise.all([
    getMeta<string>('projectUrl'),
    getMeta<string>('anonKey'),
    getMeta<string>('accessToken'),
    getMeta<string>('refreshToken'),
    getMeta<string>('userId'),
  ]);
  if (!projectUrl || !anonKey || !accessToken || !refreshToken) return null;
  const e2e = await e2eTransport(userId ?? null);
  if (e2e) {
    cached = e2e;
    return e2e;
  }
  if (!parseProjectUrl(projectUrl)) return null;
  const { SupabaseTransport } = await import('./remote/supabase-transport');
  cached = new SupabaseTransport({
    projectUrl,
    anonKey,
    tokens: { accessToken, refreshToken },
    onTokens: persistTokens,
  });
  return cached;
}

export function resetTransport(): void {
  cached = null;
}
