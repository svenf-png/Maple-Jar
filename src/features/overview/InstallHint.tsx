import { useState } from 'react';
import { focusHeading } from '../../app/route-focus';
import { t, useLang } from '../../i18n/t';
import {
  dismissInstallHint,
  isInstallHintDismissed,
  readInstallEnv,
  shouldShowInstallHint,
} from '../../platform/install-hint';
import styles from './InstallHint.module.css';

/** Einmaliger Hinweis für iOS Safari: Zum Home-Bildschirm hinzufügen (lazy über die Übersicht). */
export function InstallHint() {
  useLang();
  const [show, setShow] = useState(() =>
    shouldShowInstallHint(readInstallEnv(), isInstallHintDismissed()),
  );
  if (!show) return null;
  return (
    <section className={styles.banner} aria-label={t('install.title')}>
      <div className={styles.text}>
        <strong className={styles.title}>{t('install.title')}</strong>
        <p className={styles.hint}>
          {t('install.before')} <ShareIcon /> {t('install.after')}
        </p>
      </div>
      <button
        type="button"
        className={styles.close}
        aria-label={t('install.close')}
        onClick={() => {
          dismissInstallHint();
          setShow(false);
          focusHeading();
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </section>
  );
}

/** Teilen-Symbol von iOS Safari: offenes Quadrat mit Pfeil nach oben. */
function ShareIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={t('install.shareIcon')}
      className={styles.share}
    >
      <path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v8A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 9H16" />
      <path d="M12 3v12M8.5 6.5L12 3l3.5 3.5" />
    </svg>
  );
}
