import type { BrowserContext } from '@playwright/test';
import { createFakeSupabase } from '../../src/data/remote/fake-supabase';
import { MemoryServer } from '../../src/data/remote/memory-transport';
import { PERSON_A, PERSON_B, PERSON_C, PROJECT_URL } from './fixtures/household';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, prefer, accept',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

/**
 * Ein gemeinsamer Server im Testprozess, den mehrere Browser-Kontexte (zwei Geräte) über den echten
 * Supabase-Client ansprechen. Netzaufrufe an die Projekt-URL werden abgefangen, nichts verlässt den Rechner.
 */
export function createSharedServer() {
  const server = new MemoryServer([PERSON_A, PERSON_B, PERSON_C]);
  const fake = createFakeSupabase(server, PROJECT_URL);
  async function install(context: BrowserContext) {
    await context.route(`${PROJECT_URL}/**`, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const res = await fake.fetch(req.url(), {
        method: req.method(),
        headers: req.headers(),
        ...(req.postData() ? { body: req.postData() as string } : {}),
      });
      return route.fulfill({
        status: res.status,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: await res.text(),
      });
    });
  }
  return { server, install };
}
