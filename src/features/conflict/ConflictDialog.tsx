import { t, useLang } from '../../i18n/t';
import { Dialog } from '../../ui';

export type ConflictEntity = 'income' | 'fixedCost' | 'goal';

interface Props {
  entity: ConflictEntity;
  rowId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Stub (Fundament M3-B): B3 füllt den Dialog.
 * Einstieg nur lazy: `const { ConflictDialog } = await import('../conflict/ConflictDialog')`,
 * davor `await loadPlanMessages()`. Kein Route, der Aufrufer hält `open`/`onClose` selbst.
 */
export function ConflictDialog({ open, onClose }: Props) {
  useLang();
  return (
    <Dialog open={open} title={t('conflict.title')} onClose={onClose}>
      <p>{t('plan.stub')}</p>
    </Dialog>
  );
}
