import { getSessionState, onDisconnect, subscribeSession } from '../session';
import { dispatchSync } from './status-store';

// Leichte Steuerung. Der Sync-Code selbst (Engine, Pull/Push, Fold, Schema) wird erst bei Bedarf geladen.

type Runtime = typeof import('./runtime');
let runtime: Promise<Runtime> | null = null;
const load = (): Promise<Runtime> => {
  runtime ??= import('./runtime');
  return runtime;
};

/** Nach erneuter Anmeldung: Fehlerzustand zurücksetzen und sofort synchronisieren. */
export function afterReauth(): void {
  dispatchSync({ type: 'reauthenticated' });
  void load().then((r) => r.requestSync());
}

/** Startet bzw. stoppt den Sync passend zur Sitzung (einmal aus `main.tsx` aufrufen). */
export function initSyncRuntime(): void {
  onDisconnect(async () => {
    if (runtime) (await runtime).stopSync();
  });
  const apply = () => {
    const s = getSessionState();
    if (s.status !== 'ready') return;
    if (s.session?.household) void load().then((r) => r.startSync());
    else if (runtime) void runtime.then((r) => r.stopSync());
  };
  subscribeSession(apply);
  apply();
}
