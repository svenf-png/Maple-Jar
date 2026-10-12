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
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, text, confirmLabel, onConfirm, onCancel }: Props) {
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
        <Button variant="primary" onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </dialog>
  );
}
