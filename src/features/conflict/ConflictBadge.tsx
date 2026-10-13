import type { ConflictEntity } from '../../data/conflict-actions';
import { t, useLang } from '../../i18n/t';
import { InfoIcon } from '../../icons/ui-icons';
import styles from './ConflictDialog.module.css';
import { useConflictDialog } from './use-conflict-dialog';

interface Props {
  entity: ConflictEntity;
  rowId: string;
}

/** Info-Pille „Konflikt“, öffnet den Konflikt-Dialog (lazy). Für Listen und Detailseiten (B1/B3). */
export function ConflictBadge({ entity, rowId }: Props) {
  useLang();
  const { show, dialog } = useConflictDialog(entity, rowId);
  return (
    <>
      <button type="button" className={styles.badge} onClick={() => void show()}>
        <InfoIcon size={16} />
        {t('history.conflict')}
      </button>
      {dialog}
    </>
  );
}
