// Schwerer Teil der Sync-Laufzeit. Wird nur per import() aus control.ts geladen.
import { liveQuery } from 'dexie';
import { db } from '../db';
import { fetchRate } from '../fx/frankfurter';
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
  }
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
