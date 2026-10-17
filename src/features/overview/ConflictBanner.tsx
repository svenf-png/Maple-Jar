import type { ConflictEntity } from '../../data/conflict-actions';
import { type ConflictRow, db } from '../../data/db';
import { useLiveQuery } from '../../data/use-live-query';
import { t, useLang } from '../../i18n/t';
import { InfoIcon } from '../../icons/ui-icons';
import { Button } from '../../ui';
import { pickConflict } from '../conflict/pick-conflict';
import { useConflictDialog } from '../conflict/use-conflict-dialog';
import styles from './ConflictBanner.module.css';

/** Übersicht: zeigt den ersten offenen Konflikt mit Einstieg in den Konflikt-Dialog (lazy). */
export function ConflictBanner() {
  const rows = useLiveQuery<ConflictRow[]>(() => db.conflicts.toArray(), [], []);
  const pick = pickConflict(rows);
  if (!pick) return null;
  return <ConflictBannerInner key={`${pick.entity}:${pick.rowId}`} {...pick} />;
}

interface InnerProps {
  entity: ConflictEntity;
  rowId: string;
  count: number;
}

function ConflictBannerInner({ entity, rowId, count }: InnerProps) {
  useLang();
  const { show, dialog } = useConflictDialog(entity, rowId);
  return (
    <section className={styles.banner} aria-label={t('conflict.banner.label')}>
      <div className={styles.text}>
        <div className={styles.title}>
          <InfoIcon size={24} />
          <strong>
            {t(count === 1 ? 'conflict.banner.one' : 'conflict.banner.many', { count })}
          </strong>
        </div>
        <p className={styles.hint}>{t('conflict.banner.hint')}</p>
      </div>
      <Button variant="secondary" onClick={() => void show()}>
        {t('conflict.title')}
      </Button>
      {dialog}
    </section>
  );
}
