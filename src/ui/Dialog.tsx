import { type ReactNode, useEffect, useId, useRef } from 'react';
import styles from './Dialog.module.css';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Modaler Dialog auf Basis von <dialog> (Fokusfalle und Escape vom Browser). */
export function Dialog({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={styles.dialog} onCancel={onClose} aria-labelledby={titleId}>
      {open ? (
        <>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </>
      ) : null}
    </dialog>
  );
}
