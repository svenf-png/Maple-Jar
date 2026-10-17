import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { retrySync } from '../data/sync/control';
import { useSyncState, useSyncStatus } from '../data/sync/status-store';
import { t, useLang } from '../i18n/t';
import { CloudOkIcon, CloudUpIcon } from '../icons/ui-icons';
import { StatusPill } from '../ui';
import styles from './SyncStatusPill.module.css';
import { WifiOffIcon } from './status-icons';

/** Sync-Status: immer Symbol plus Text, nie nur Farbe. Die Live-Region steht vor dem Inhalt. */
export function SyncStatusPill() {
  useLang();
  const status = useSyncStatus();
  const { running } = useSyncState();
  let content: ReactNode;
  switch (status.kind) {
    case 'reauth':
      content = (
        <Link to="/anmelden" className={styles.hit}>
          <StatusPill variant="warn">{t('status.reauth')}</StatusPill>
        </Link>
      );
      break;
    case 'offline':
      content = (
        <StatusPill variant="neutral" icon={WifiOffIcon}>
          {status.pending > 0
            ? t('status.offlinePending', { count: status.pending })
            : t('status.offline')}
        </StatusPill>
      );
      break;
    case 'error':
      content = (
        <button type="button" className={styles.hit} onClick={() => retrySync()} disabled={running}>
          <StatusPill variant="warn">
            {t(running ? 'status.syncing' : 'status.errorRetry')}
          </StatusPill>
        </button>
      );
      break;
    case 'pending':
      content = (
        <StatusPill variant="info" icon={CloudUpIcon}>
          {t('status.pending', { count: status.count })}
        </StatusPill>
      );
      break;
    case 'connected':
      content = (
        <StatusPill variant="ok" icon={CloudOkIcon}>
          {t('status.connected')}
        </StatusPill>
      );
      break;
  }
  return (
    <span role="status" className={styles.live}>
      {content}
    </span>
  );
}
