import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { focusHeading, focusUnclaimed, shouldMoveFocus } from './route-focus';

/**
 * Wurzel-Route: setzt nach jedem Seitenwechsel den Fokus auf die Überschrift, damit Tastatur und
 * Screenreader die neue Seite sofort erreichen. Der Effekt räumt sein `requestAnimationFrame` nicht
 * auf, weil React StrictMode den Effekt doppelt ausführt und der Fokus sonst ausfiele. Hat bis zum Frame
 * jemand anderes den Fokus gesetzt (z. B. ein Eingabefeld), bleibt dieser erhalten.
 */
export function RootLayout() {
  const { pathname } = useLocation();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = pathname;
    if (!shouldMoveFocus(before, pathname)) return;
    const atNavigation = document.activeElement;
    requestAnimationFrame(() => {
      if (focusUnclaimed(atNavigation, document.activeElement, document.body)) focusHeading();
    });
  }, [pathname]);
  return <Outlet />;
}
