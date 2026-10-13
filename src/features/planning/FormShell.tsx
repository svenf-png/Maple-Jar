import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import styles from './PlanForm.module.css';

interface Props {
  title: string;
  closeTo: string;
  children: ReactNode;
}

/** Rahmen der Planungs-Formulare im Stil des Erfassen-Blatts. */
export function FormShell({ title, closeTo, children }: Props) {
  return (
    <main className={styles.page}>
      <section className={styles.sheet} aria-label={title}>
        <div className={styles.head}>
          <Link to={closeTo} className={styles.cancel}>
            {t('common.cancel')}
          </Link>
          <h1 className={styles.title}>{title}</h1>
          <span />
        </div>
        {children}
      </section>
    </main>
  );
}

/** Amber Hinweis mit Symbol und Text (role="alert"). */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className={styles.error} role="alert">
      <WarnIcon size={18} />
      <span>{message}</span>
    </p>
  );
}
