// Nur im E2E-Build (VITE_E2E=1). Szenarien: empty, member, solo (nur B Mitglied), full (A und B Mitglied, C fremd).
import { PERSON_A, PERSON_B, PERSON_C, SETTINGS } from '../../tests/e2e/fixtures/household';
import { MemoryServer } from './remote/memory-transport';
import type { SyncTransport } from './remote/sync-transport';

const asMember = (p: typeof PERSON_A | typeof PERSON_B | typeof PERSON_C) => ({
  userId: p.userId,
  username: p.username,
  displayName: p.displayName,
  color: p.color,
  locale: 'de-DE' as const,
  theme: 'auto' as const,
});

export function createE2eTransport(scenario: string, userId: string | null): SyncTransport {
  const server = new MemoryServer([PERSON_A, PERSON_B, PERSON_C]);
  if (scenario !== 'empty') {
    server.household = {
      formatVersion: 1,
      householdId: '00000000-0000-4000-8000-000000000001',
      createdAt: '2027-01-01T00:00:00.000Z',
      settings: { ...SETTINGS },
    };
    server.members =
      scenario === 'solo' ? [asMember(PERSON_B)] : [asMember(PERSON_A), asMember(PERSON_B)];
  }
  const transport = server.client();
  if (userId) transport.adopt(server.issue(userId));
  return transport;
}
