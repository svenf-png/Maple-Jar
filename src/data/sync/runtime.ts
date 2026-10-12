// Schwerer Teil der Sync-Laufzeit. Wird nur per import() aus control.ts geladen.
import { liveQuery } from 'dexie';
import type { KnownRate } from '../../domain/fx';
import { todayIso } from '../../features/shared/helpers';
import { db } from '../db';
import { type FxProvider, fetchRate, lastKnownRate } from '../fx/frankfurter';
import { getTransport } from '../transport-factory';
import { onLocalChange } from '../write';
import { runSync } from './cycle';
import { classify } from './engine';
import { catchUpRates } from './fx-catchup';
import { createScheduler, type Scheduler } from './scheduler';
import { dispatchSync, resetSyncState } from './status-store';

let scheduler: Scheduler | null = null;
let unsubLocal: (() => void) | null = null;
let outboxWatch: { unsubscribe(): void } | null = null;
let householdFetched = false;

/** Kurs wie in der Erfassung: Tageskurs (max. 3 s), sonst letzter bekannter, sonst null. */
async function knownRate(provider: FxProvider, day: string): Promise<KnownRate | null> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 3000));
  const fetched = navigator.onLine
    ? await Promise.race([fetchRate(day, provider).catch(() => null), timeout])
    : null;
  const r = fetched ?? (await lastKnownRate(provider));
  return r ? { rateMicro: r.rateMicro, date: r.date, stale: r.stale } : null;
}

let autobooking: Promise<void> | null = null;

/**
 * Bucht fällige Autobook-Fixkosten. Hängt nicht vom Netz ab (CAD geht offline); Fehler werden verschluckt, der
 * Sync darf daran nie scheitern. Der Code wird erst hier per import() geladen.
 */
function autobook(): Promise<void> {
  autobooking ??= (async () => {
    try {
      const day = todayIso();
      const { runAutobook } = await import('../actions');
      const needsRate = await db.fixedCost
        .filter((f) => !f.deleted && f.autobook === true && f.currency === 'EUR')
        .count();
      const provider = (
        (await db.meta.get('household'))?.value as { settings?: { fxProvider?: FxProvider } }
      )?.settings?.fxProvider;
      const rate = needsRate > 0 && provider ? await knownRate(provider, day) : null;
      await runAutobook(db, rate, day);
    } catch {
      // Nächster Lauf versucht es erneut.
    }
  })().finally(() => {
    autobooking = null;
  });
  return autobooking;
}

async function cycle(): Promise<void> {
  const transport = await getTransport();
  if (!transport) return;
  dispatchSync({ type: 'online', online: navigator.onLine });
  if (!navigator.onLine) return;
  dispatchSync({ type: 'start' });
  try {
    await runSync(db, transport, { forceHousehold: !householdFetched });
    householdFetched = true;
    dispatchSync({ type: 'success', at: Date.now() });
    await catchUpRates(db, fetchRate);
  } catch (err) {
    dispatchSync({ type: 'failure', problem: classify(err) });
    return;
  }
  await autobook();
}

const onOffline = () => dispatchSync({ type: 'online', online: false });
const onOnline = () => dispatchSync({ type: 'online', online: true });

export function requestSync(): void {
  scheduler?.runNow();
}

export function startSync(): void {
  if (scheduler) return;
  householdFetched = false;
  scheduler = createScheduler({ run: cycle });
  unsubLocal = onLocalChange(() => scheduler?.poke());
  // „N warten auf Sync“ live aus der Outbox
  outboxWatch = liveQuery(() => db.outbox.count()).subscribe({
    next: (count) => dispatchSync({ type: 'pending', count }),
    error: () => {},
  });
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  scheduler.start();
  // Start: auch offline sofort buchen (der erste Sync-Lauf bricht ohne Netz früh ab).
  void autobook();
}

export function stopSync(): void {
  scheduler?.stop();
  scheduler = null;
  unsubLocal?.();
  unsubLocal = null;
  outboxWatch?.unsubscribe();
  outboxWatch = null;
  window.removeEventListener('offline', onOffline);
  window.removeEventListener('online', onOnline);
  resetSyncState();
}
