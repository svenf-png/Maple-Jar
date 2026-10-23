import { Link } from 'react-router';
import { t, useLang } from '../../i18n/t';
import styles from '../../ui/Segmented.module.css';

/** Umschalter zwischen Planungsliste und Projektion: Optik wie Segmented, aber Links (Routen bleiben erhalten). */
export function PlanTabs({ current }: { current: 'list' | 'projection' }) {
  useLang();
  return (
    <nav aria-label={t('plan.tabs')} className={`${styles.group} ${styles.fit}`}>
      <Link
        to="/planung"
        className={styles.item}
        aria-current={current === 'list' ? 'page' : undefined}
      >
        <span className={styles.face}>{t('plan.tab.list')}</span>
      </Link>
      <Link
        to="/planung/projektion"
        className={styles.item}
        aria-current={current === 'projection' ? 'page' : undefined}
      >
        <span className={styles.face}>{t('plan.tab.projection')}</span>
      </Link>
    </nav>
  );
}
