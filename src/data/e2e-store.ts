import { householdJson, PERSON_A, PERSON_B, VALID_TOKEN } from '../../tests/e2e/fixtures/household';
import { MemoryStore } from './remote/memory-store';
import type { RemoteStore } from './remote/remote-store';

/** Szenarien: `empty` (kein Haushalt, Standard), `member` (beide Personen), `solo` (nur Person B). */
export function createE2eStore(token: string, scenario: string | null): RemoteStore {
  const files: Record<string, string> = {};
  if (scenario === 'member') files['household.json'] = householdJson([PERSON_A, PERSON_B]);
  if (scenario === 'solo') files['household.json'] = householdJson([PERSON_B]);
  const store = new MemoryStore({ login: PERSON_A.githubLogin, files });
  store.setAuthValid(token === VALID_TOKEN);
  return store;
}
