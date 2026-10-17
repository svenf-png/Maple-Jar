import { type RefObject, useEffect, useRef } from 'react';

/**
 * Gibt den Fokus nach dem Schließen eines Dialogs an den Auslöser zurück. Das native `<dialog>` tut das
 * meist selbst; der Hook deckt Fälle ab, in denen der Auslöser beim Re-Render neu gemountet wurde.
 * Die Rückgabe läuft im nächsten Frame, weil `close()` des Dialogs im selben Commit erst danach wirkt.
 */
export function useRestoreFocus(open: boolean, ref: RefObject<HTMLDialogElement | null>): void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    if (!open && wasOpen.current) {
      const target = opener.current;
      opener.current = null;
      requestAnimationFrame(() => {
        if (ref.current?.open) return;
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    }
    wasOpen.current = open;
  }, [open, ref]);
}
