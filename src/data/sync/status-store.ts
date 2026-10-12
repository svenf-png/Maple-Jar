import { useSyncExternalStore } from 'react';
import { initialSyncState, reduceSync, type SyncAction, type SyncState, statusOf } from './engine';

// Kleiner, leichter Zustandsspeicher für die Statusanzeige. Der schwere Sync-Code (runtime.ts) wird erst
// nach der Anmeldung per import() geladen und meldet seine Zustände hierher.

let state: SyncState = {
  ...initialSyncState,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
};
const listeners = new Set<() => void>();

export function dispatchSync(action: SyncAction): void {
  const next = reduceSync(state, action);
  if (next === state) return;
  state = next;
  for (const l of listeners) l();
}

export function resetSyncState(): void {
  state = {
    ...initialSyncState,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
  };
  for (const l of listeners) l();
}

export const getSyncState = (): SyncState => state;
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const useSyncState = (): SyncState =>
  useSyncExternalStore(subscribe, getSyncState, getSyncState);
export const useSyncStatus = () => statusOf(useSyncState());
