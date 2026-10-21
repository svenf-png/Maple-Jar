import { Link } from 'react-router';
import { useSyncStatus } from '../data/sync/status-store';
import { t } from '../i18n/t';
import { CloudOkIcon } from '../icons/ui-icons';
import { StatusPill } from '../ui';
import styles from './SyncStatusPill.module.css';

/** Sync-Status im Seitenkopf: Pille mit Icon und Text bei Abweichungen, sonst nur ein Icon-Button (44 × 44). */
export function SyncStatusPill() {
  const status = useSyncStatus();
  switch (status.kind) {
    case 'reauth':
      return (
        <Link to="/anmelden" aria-label={t('status.reauth')}>
          <StatusPill variant="warn">{t('status.reauth')}</StatusPill>
        </Link>
      );
    case 'offline':
      return <StatusPill variant="warn">{t('status.offline')}</StatusPill>;
    case 'pending':
      return <StatusPill variant="info">{t('status.pending', { count: status.count })}</StatusPill>;
    case 'error':
      return <StatusPill variant="warn">{t('status.error')}</StatusPill>;
    case 'connected':
      return (
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={t('status.synced')}
          title={t('status.synced')}
          onClick={() => void import('../data/sync/runtime').then((r) => r.requestSync())}
        >
          <CloudOkIcon size={22} />
        </button>
      );
  }
}
