import { Link } from 'react-router';
import { useSyncStatus } from '../data/sync/status-store';
import { t } from '../i18n/t';
import { StatusPill } from '../ui';

/** Sync-Status in der Seitenkopf-Pille: immer Icon plus Text, nie nur Farbe. */
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
      return <StatusPill variant="neutral">{t('status.connected')}</StatusPill>;
  }
}
