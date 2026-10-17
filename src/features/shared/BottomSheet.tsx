import { type MouseEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import styles from './BottomSheet.module.css';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modales Blatt auf Basis von <dialog>: am Handy unten verankert, am Desktop zentriert (max. 480 px).
 * Fokusfalle und Escape kommen vom Browser; Klick auf den Hintergrund schließt ebenfalls.
 */
export function BottomSheet({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // Ein Klick direkt auf das <dialog> trifft den Hintergrund (Inhalt liegt im inneren div).
  const onScrim = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape (cancel) schließt per Tastatur
    <dialog
      ref={ref}
      className={styles.sheet}
      onCancel={onClose}
      onClick={onScrim}
      aria-labelledby={titleId}
    >
      {open ? (
        <div className={styles.body}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
