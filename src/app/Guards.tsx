import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useSessionState } from '../data/use-session';

/** Ohne Verbindung → Verbinden, ohne Haushalt → Einrichten bzw. Beitreten. */
export function RequireHousehold({ children }: { children: ReactNode }) {
  const state = useSessionState();
  if (state.status === 'loading') return null;
  if (!state.session) return <Navigate to="/verbinden" replace />;
  if (!state.session.household) {
    return <Navigate to={state.session.stage === 'join' ? '/beitreten' : '/einrichten'} replace />;
  }
  return children;
}

/** Schritte vor dem Haushalt: nur mit Sitzung, aber ohne Haushalt (`stage` bestimmt den Schritt). */
export function RequireConnection({
  stage,
  children,
}: {
  stage: 'setup' | 'join';
  children: ReactNode;
}) {
  const state = useSessionState();
  if (state.status === 'loading') return null;
  if (!state.session) return <Navigate to="/verbinden" replace />;
  if (state.session.household) return <Navigate to="/" replace />;
  if (state.session.stage !== stage) {
    return <Navigate to={state.session.stage === 'join' ? '/beitreten' : '/einrichten'} replace />;
  }
  return children;
}

/** Verbinden-Screen: bereits verbundene Geräte gehen direkt weiter. */
export function RedirectIfConnected({ children }: { children: ReactNode }) {
  const state = useSessionState();
  if (state.status === 'loading') return null;
  if (state.session?.household) return <Navigate to="/" replace />;
  return children;
}
