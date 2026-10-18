import { Link } from 'react-router';
import { t, useLang } from '../../i18n/t';
import styles from './PlanTabs.module.css';

/** Umschalter zwischen Planungsliste und Projektion (Links, damit die Routen erhalten bleiben). */
export function PlanTabs({ current }: { current: 'list' | 'projection' }) {
  useLang();
  return (
    <nav aria-label={t('plan.tabs')} className={styles.tabs}>
      <Link
        to="/planung"
        className={styles.tab}
        aria-current={current === 'list' ? 'page' : undefined}
      >
        {t('plan.tab.list')}
      </Link>
      <Link
        to="/planung/projektion"
        className={styles.tab}
        aria-current={current === 'projection' ? 'page' : undefined}
      >
        {t('plan.tab.projection')}
      </Link>
    </nav>
  );
}
