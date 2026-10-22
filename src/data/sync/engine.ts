import {
  AuthError,
  ForbiddenError,
  NetworkError,
  RateLimitError,
  ServerError,
} from '../remote/sync-transport';

// --- Zustandsmaschine (rein) -------------------------------------------------

export type SyncProblem = 'network' | 'auth' | 'forbidden' | 'rate' | 'server';

export interface SyncState {
  running: boolean;
  online: boolean;
  problem: SyncProblem | null;
  pending: number;
  lastSyncAt: number | null;
}

export type SyncAction =
  | { type: 'start' }
  | { type: 'success'; at: number }
  | { type: 'failure'; problem: SyncProblem }
  | { type: 'online'; online: boolean }
  | { type: 'pending'; count: number }
  | { type: 'reauthenticated' };

export const initialSyncState: SyncState = {
  running: false,
  online: true,
  problem: null,
  pending: 0,
  lastSyncAt: null,
};

export function reduceSync(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case 'start':
      return { ...state, running: true };
    case 'success':
      return { ...state, running: false, problem: null, lastSyncAt: action.at };
    case 'failure':
      return { ...state, running: false, problem: action.problem };
    case 'online':
      return { ...state, online: action.online };
    case 'pending':
      return { ...state, pending: action.count };
    case 'reauthenticated':
      return { ...state, problem: state.problem === 'auth' ? null : state.problem };
  }
}

export type SyncStatus =
  | { kind: 'reauth' }
  | { kind: 'offline'; pending: number }
  | { kind: 'error' }
  | { kind: 'pending'; count: number }
  | { kind: 'connected' };

/** Anzeige-Status. Reihenfolge: Anmeldung > Offline > Fehler > ausstehend > verbunden. */
export function statusOf(state: SyncState): SyncStatus {
  if (state.problem === 'auth') return { kind: 'reauth' };
  if (!state.online || state.problem === 'network')
    return { kind: 'offline', pending: state.pending };
  if (state.problem) return { kind: 'error' };
  if (state.pending > 0) return { kind: 'pending', count: state.pending };
  return { kind: 'connected' };
}

export function classify(err: unknown): SyncProblem {
  if (err instanceof AuthError) return 'auth';
  if (err instanceof NetworkError) return 'network';
  if (err instanceof ForbiddenError) return 'forbidden';
  if (err instanceof RateLimitError) return 'rate';
  if (err instanceof ServerError) return 'server';
  return 'server';
}
