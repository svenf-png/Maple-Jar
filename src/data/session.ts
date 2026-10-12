import { db, getMeta } from './db';
import type { Household } from './household';
import { parseProjectUrl } from './remote/project-url';
import type { Session as AuthSession, HouseholdInput, ProfileInput } from './remote/sync-transport';
import { createLoginTransport, getTransport, resetTransport } from './transport-factory';

/** Sitzungszustand für die Oberfläche. Tokens bleiben in Dexie `meta` und gelangen nie hierher. */
export interface Session {
  projectUrl: string;
  userId: string;
  username: string;
  deviceId: string;
  household: Household | null;
  /** Solange kein Haushalt gespeichert ist: nächster Schritt. */
  stage: 'setup' | 'join' | null;
}

export type SessionState = { status: 'loading' } | { status: 'ready'; session: Session | null };

let state: SessionState = { status: 'loading' };
const listeners = new Set<() => void>();

function publish(next: SessionState): void {
  state = next;
  for (const l of listeners) l();
}

export const subscribeSession = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
export const getSessionState = (): SessionState => state;

export async function loadSession(): Promise<void> {
  const [
    projectUrl,
    anonKey,
    accessToken,
    refreshToken,
    userId,
    username,
    deviceId,
    household,
    stage,
  ] = await Promise.all([
    getMeta<string>('projectUrl'),
    getMeta<string>('anonKey'),
    getMeta<string>('accessToken'),
    getMeta<string>('refreshToken'),
    getMeta<string>('userId'),
    getMeta<string>('username'),
    getMeta<string>('deviceId'),
    getMeta<Household>('household'),
    getMeta<'setup' | 'join'>('stage'),
  ]);
  if (projectUrl && anonKey && accessToken && refreshToken && userId && username && deviceId) {
    publish({
      status: 'ready',
      session: {
        projectUrl,
        userId,
        username,
        deviceId,
        household: household ?? null,
        stage: household ? null : (stage ?? 'setup'),
      },
    });
  } else {
    publish({ status: 'ready', session: null });
  }
}

export type ConnectResult = { kind: 'ok' | 'setup' | 'join' } | { kind: 'notMember' };

export type ConnectInput = {
  projectUrl: string;
  anonKey: string;
  username: string;
  password: string;
};

async function persistAuth(auth: AuthSession): Promise<void> {
  await db.meta.bulkPut([
    { key: 'accessToken', value: auth.accessToken },
    { key: 'refreshToken', value: auth.refreshToken },
    { key: 'userId', value: auth.userId },
  ]);
}

/**
 * Meldet an, prüft die Mitgliedschaft und speichert bei Erfolg. Fehler der Remote-Schicht werden durchgereicht.
 * `projectUrl` und `username` müssen vorher normalisiert sein (`parseProjectUrl`, `normalizeUsername`).
 */
export async function connect(input: ConnectInput): Promise<ConnectResult> {
  const origin = parseProjectUrl(input.projectUrl);
  if (!origin) throw new Error('Invalid project URL');
  const transport = await createLoginTransport(origin, input.anonKey);
  try {
    const auth = await transport.signIn(input.username, input.password);
    const status = await transport.getStatus();
    if (status.exists && !status.isMember && status.memberCount >= 2) {
      resetTransport();
      return { kind: 'notMember' };
    }
    {
      const household = status.isMember ? await transport.getHousehold() : null;
      if (status.isMember && !household) throw new Error('Household unreadable');
      const deviceId = (await getMeta<string>('deviceId')) ?? crypto.randomUUID();
      const stage = status.isMember ? null : status.exists ? 'join' : 'setup';
      await db.meta.bulkPut([
        { key: 'projectUrl', value: origin },
        { key: 'anonKey', value: input.anonKey },
        { key: 'username', value: input.username },
        { key: 'deviceId', value: deviceId },
        { key: 'household', value: household },
        { key: 'stage', value: stage },
      ]);
      await persistAuth(auth);
      await loadSession();
      return { kind: stage ?? 'ok' };
    }
  } catch (err) {
    resetTransport();
    throw err;
  }
}

async function saveHousehold(household: Household, publishNow = true): Promise<void> {
  await db.meta.bulkPut([
    { key: 'household', value: household },
    { key: 'stage', value: null },
  ]);
  if (publishNow) await loadSession();
}

/**
 * Legt den Haushalt an (erste Person), schreibt die Startwerte der Einstellungen als Ereignis und führt
 * `beforeReady` aus (z. B. Kategorien aus der Vorlage anlegen). Erst danach gilt die Sitzung als bereit,
 * damit die Oberfläche nicht mit halbfertigen Daten startet.
 */
export async function createHousehold(
  input: HouseholdInput,
  beforeReady?: () => Promise<void>,
): Promise<void> {
  const transport = await getTransport();
  if (!transport) throw new Error('No session');
  const household = await transport.createHousehold(input);
  await saveHousehold(household, false);
  const { appendLocalEvent } = await import('./write');
  await appendLocalEvent(db, {
    entity: 'settings',
    rowId: household.householdId,
    op: 'create',
    data: { ...household.settings },
  });
  await beforeReady?.();
  await loadSession();
}

/** Zweite Person tritt dem vorhandenen Haushalt bei. */
export async function joinHousehold(profile: ProfileInput): Promise<void> {
  const transport = await getTransport();
  if (!transport) throw new Error('No session');
  await saveHousehold(await transport.joinHousehold(profile));
}

/** Anmeldung erneuern (Refresh-Token abgelaufen oder widerrufen). Lokale Daten bleiben erhalten. */
export async function renewLogin(password: string): Promise<void> {
  const transport = await getTransport();
  const username = await getMeta<string>('username');
  if (!transport || !username) throw new Error('No session');
  const auth = await transport.signIn(username, password);
  await persistAuth(auth);
}

const disconnectHooks = new Set<() => void | Promise<void>>();
/** Hooks laufen vor dem Löschen der lokalen Daten (z. B. Sync anhalten). */
export const onDisconnect = (cb: () => void | Promise<void>): void => {
  disconnectHooks.add(cb);
};

export async function disconnect(): Promise<void> {
  for (const hook of disconnectHooks) await hook();
  await db.delete();
  await db.open();
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('maple-jar.')) localStorage.removeItem(key);
    }
  } catch {
    // ignorieren
  }
  try {
    await caches.delete('fx-rates');
  } catch {
    // Cache-API nicht verfügbar
  }
  resetTransport();
  publish({ status: 'ready', session: null });
  window.location.hash = '#/verbinden';
}
