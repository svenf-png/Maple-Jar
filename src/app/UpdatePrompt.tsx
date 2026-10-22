import { useSyncExternalStore } from 'react';
import { t, useLang } from '../i18n/t';
import {
  applyRegisteredUpdate,
  dismissUpdate,
  getUpdateSnapshot,
  subscribeUpdate,
} from '../platform/sw-update';
import { Button } from '../ui';
import styles from './UpdatePrompt.module.css';

/** Nicht-modaler Hinweis auf eine neue Version. Neu geladen wird erst nach dem Tipp, der Fokus bleibt unberührt. */
export function UpdatePrompt() {
  useLang();
  const waiting = useSyncExternalStore(subscribeUpdate, getUpdateSnapshot, () => false);
  if (!waiting) return null;
  return (
    <div className={styles.prompt} role="status">
      <div className={styles.text}>
        <strong className={styles.title}>{t('update.title')}</strong>
        <p className={styles.sub}>{t('update.sub')}</p>
      </div>
      <div className={styles.actions}>
        <Button variant="text" onClick={dismissUpdate}>
          {t('update.later')}
        </Button>
        <Button variant="text" onClick={applyRegisteredUpdate}>
          {t('update.reload')}
        </Button>
      </div>
    </div>
  );
}
