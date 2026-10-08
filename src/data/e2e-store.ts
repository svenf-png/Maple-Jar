import { MemoryStore } from './remote/memory-store';
import type { RemoteStore } from './remote/remote-store';

const VALID_TOKEN = 'test-token';

const household = (members: Array<{ githubLogin: string; displayName: string; color: string }>) =>
  `${JSON.stringify(
    {
      format: 1,
      householdId: '00000000-0000-4000-8000-000000000001',
      createdAt: '2027-01-01T00:00:00.000Z',
      members,
      settings: {
        name: 'Testhaushalt',
        placeLabel: null,
        periodStart: '2027-01-01',
        periodEnd: '2027-12-31',
        baseCurrency: 'CAD',
        secondCurrency: 'EUR',
        fxProvider: 'ECB',
      },
    },
    null,
    2,
  )}\n`;

const A = { githubLogin: 'person-a', displayName: 'Person A', color: '#2C6CB0' };
const B = { githubLogin: 'person-b', displayName: 'Person B', color: '#A2456E' };

/** Szenarien: `empty` (kein Haushalt), `member` (beide Personen), `solo` (nur Person B), sonst `empty`. */
export function createE2eStore(token: string, scenario: string | null): RemoteStore {
  const files: Record<string, string> = {};
  if (scenario === 'member') files['household.json'] = household([A, B]);
  if (scenario === 'solo') files['household.json'] = household([B]);
  const store = new MemoryStore({ login: 'person-a', files });
  store.setAuthValid(token === VALID_TOKEN);
  return store;
}
