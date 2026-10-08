import { db, getMeta } from './db';
import { findMember, type Household, parseHousehold } from './household';
import { getStore, resetStoreCache } from './store-factory';

export interface Session {
  token: string;
  repo: string;
  login: string;
  deviceId: string;
  household: Household | null;
  householdSha: string | null;
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
  const [token, repo, login, deviceId, household, householdSha] = await Promise.all([
    getMeta<string>('token'),
    getMeta<string>('repo'),
    getMeta<string>('login'),
    getMeta<string>('deviceId'),
    getMeta<Household>('household'),
    getMeta<string>('householdSha'),
  ]);
  if (token && repo && login && deviceId) {
    publish({
      status: 'ready',
      session: {
        token,
        repo,
        login,
        deviceId,
        household: household ?? null,
        householdSha: householdSha ?? null,
      },
    });
  } else {
    publish({ status: 'ready', session: null });
  }
}

export type HouseholdOutcome =
  | { kind: 'ok'; household: Household; sha: string }
  | { kind: 'notMember' | 'notYetMember' | 'invalid' };

/** Bewertet eine vorhandene household.json für den angemeldeten Login. */
export function evaluateHousehold(text: string, sha: string, login: string): HouseholdOutcome {
  const household = parseHousehold(text);
  if (!household) return { kind: 'invalid' };
  if (findMember(household, login)) return { kind: 'ok', household, sha };
  return { kind: household.members.length < 2 ? 'notYetMember' : 'notMember' };
}

async function persist(session: Session): Promise<void> {
  await db.meta.bulkPut([
    { key: 'token', value: session.token },
    { key: 'repo', value: session.repo },
    { key: 'login', value: session.login },
    { key: 'deviceId', value: session.deviceId },
    { key: 'household', value: session.household },
    { key: 'householdSha', value: session.householdSha },
  ]);
  publish({ status: 'ready', session });
}

export type ConnectResult = { kind: 'setup' } | HouseholdOutcome;

/** Prüft Zugang und Haushalt, speichert bei Erfolg. Fehler der Remote-Schicht werden durchgereicht. */
export async function connect(repo: string, token: string): Promise<ConnectResult> {
  const store = await getStore(repo, token);
  const { login } = await store.whoAmI();
  await store.checkRepoAccess();
  const file = await store.readFile('household.json');
  const deviceId = (await getMeta<string>('deviceId')) ?? crypto.randomUUID();
  if (!file) {
    await persist({ token, repo, login, deviceId, household: null, householdSha: null });
    return { kind: 'setup' };
  }
  const outcome = evaluateHousehold(file.text, file.sha, login);
  if (outcome.kind === 'ok') {
    await persist({
      token,
      repo,
      login,
      deviceId,
      household: outcome.household,
      householdSha: outcome.sha,
    });
  }
  return outcome;
}

/** Speichert einen Haushalt, der gerade im Repo angelegt oder dort gefunden wurde. */
export async function saveHousehold(household: Household, sha: string): Promise<void> {
  if (state.status !== 'ready' || !state.session) throw new Error('No session');
  await persist({ ...state.session, household, householdSha: sha });
}

export async function disconnect(): Promise<void> {
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
  resetStoreCache();
  publish({ status: 'ready', session: null });
  window.location.hash = '#/verbinden';
}
