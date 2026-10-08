import { useSyncExternalStore } from 'react';
import { getSessionState, type Session, type SessionState, subscribeSession } from './session';

export function useSessionState(): SessionState {
  return useSyncExternalStore(subscribeSession, getSessionState, getSessionState);
}

/** Nur innerhalb des Guards verwenden: Sitzung und Haushalt sind vorhanden. */
export function useReadySession(): Session & { household: NonNullable<Session['household']> } {
  const state = useSessionState();
  if (state.status !== 'ready' || !state.session?.household) {
    throw new Error('Session not ready');
  }
  return state.session as Session & { household: NonNullable<Session['household']> };
}

export function useSession(): Session | null {
  const state = useSessionState();
  return state.status === 'ready' ? state.session : null;
}
