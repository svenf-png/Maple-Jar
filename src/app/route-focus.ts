/** Fokus nach einem Seitenwechsel nur, wenn es einen vorherigen Pfad gibt (nie beim ersten Laden). */
export function shouldMoveFocus(prev: string | null, next: string): boolean {
  return prev !== null && prev !== next;
}

/**
 * Setzt den Programmfokus auf die erste Überschrift in `main`, sonst auf die erste `h1`, sonst auf `main`.
 * Gibt zurück, ob das Ziel tatsächlich den Fokus hat.
 */
export function focusHeading(root: ParentNode = document): boolean {
  const target =
    root.querySelector<HTMLElement>('main h1') ??
    root.querySelector<HTMLElement>('h1') ??
    root.querySelector<HTMLElement>('main');
  if (!target) return false;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}
