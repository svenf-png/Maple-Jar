import { t, useLang } from '../../i18n/t';
import styles from './CoachMark.module.css';

/** Hinweis über dem Plus-Knopf, solange die Übersicht im Onboarding steht (nur mobil). */
export function CoachMark() {
  useLang();
  return (
    <div role="note" className={styles.mark}>
      {t('onboarding.tapPlus')}
    </div>
  );
}
