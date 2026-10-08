import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useSessionState } from '../data/use-session';

/** Ohne Verbindung → Verbinden, ohne Haushalt → Einrichten. */
export function RequireHousehold({ children }: { children: ReactNode }) {
  const state = useSessionState();
  if (state.status === 'loading') return null;
  if (!state.session) return <Navigate to="/verbinden" replace />;
  if (!state.session.household) return <Navigate to="/einrichten" replace />;
  return children;
}

export function RequireConnection({ children }: { children: ReactNode }) {
  const state = useSessionState();
  if (state.status === 'loading') return null;
  if (!state.session) return <Navigate to="/verbinden" replace />;
  if (state.session.household) return <Navigate to="/" replace />;
  return children;
}

/** Verbinden-Screen: bereits verbundene Geräte gehen direkt weiter. */
export function RedirectIfConnected({ children }: { children: ReactNode }) {
  const state = useSessionState();
  if (state.status === 'loading') return null;
  if (state.session?.household) return <Navigate to="/" replace />;
  return children;
}
