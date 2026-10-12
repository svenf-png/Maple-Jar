import { Link } from 'react-router';
import type { MessageKey } from '../../i18n/de';
import { t, useLang } from '../../i18n/t';
import styles from './HelpPage.module.css';

const STEPS: MessageKey[] = [
  'help.step1',
  'help.step2',
  'help.step3',
  'help.step4',
  'help.step5',
  'help.step6',
  'help.step7',
  'help.step8',
  'help.step9',
];

export function HelpPage() {
  useLang();
  return (
    <main className={styles.page}>
      <Link to="/verbinden" className={styles.back}>
        {t('help.back')}
      </Link>
      <h1 className="type-large-title">{t('help.title')}</h1>
      <ol className={styles.list}>
        {STEPS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
    </main>
  );
}
