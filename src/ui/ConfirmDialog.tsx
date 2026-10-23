import { useEffect, useRef } from 'react';
import { t } from '../i18n/t';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';

interface Props {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Optionale bevorzugte Aktion (z. B. „Erst synchronisieren“); die Bestätigung wird dann sekundär. */
  altLabel?: string | undefined;
  onAlt?: (() => void) | undefined;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  onConfirm,
  altLabel,
  onAlt,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={styles.dialog} onCancel={onCancel} aria-labelledby="confirm-title">
      <h2 id="confirm-title" className={styles.title}>
        {title}
      </h2>
      <p className={styles.text}>{text}</p>
      <div className={styles.actions}>
        {altLabel && onAlt ? (
          <Button variant="primary" onClick={onAlt}>
            {altLabel}
          </Button>
        ) : null}
        <Button variant={altLabel && onAlt ? 'secondary' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </dialog>
  );
}
