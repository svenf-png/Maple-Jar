import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { focusHeading, shouldMoveFocus } from './route-focus';

/**
 * Wurzel-Route: setzt nach jedem Seitenwechsel den Fokus auf die Überschrift, damit Tastatur und
 * Screenreader die neue Seite sofort erreichen. Der Effekt räumt sein `requestAnimationFrame` nicht
 * auf, weil React StrictMode den Effekt doppelt ausführt und der Fokus sonst ausfiele.
 */
export function RootLayout() {
  const { pathname } = useLocation();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = pathname;
    if (!shouldMoveFocus(before, pathname)) return;
    requestAnimationFrame(() => {
      focusHeading();
    });
  }, [pathname]);
  return <Outlet />;
}
