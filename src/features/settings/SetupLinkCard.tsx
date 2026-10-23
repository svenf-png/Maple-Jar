import { useState } from 'react';
import { buildSetupLink, loadConnectedProject } from '../../data/setup-link';
import { t } from '../../i18n/t';
import { Button, Card, ListRow } from '../../ui';
import styles from './SettingsPage.module.css';

/** Einrichtungslink für ein weiteres Gerät: nur auf Tipp erzeugt, nie geloggt, enthält kein Passwort. */
export function SetupLinkCard() {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function create() {
    const config = await loadConnectedProject();
    if (!config) return setFailed(true);
    setFailed(false);
    setLink(buildSetupLink(`${window.location.origin}${import.meta.env.BASE_URL}`, config));
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <ListRow
        title={t('settings.setupLink')}
        subtitle={t('settings.setupLink.hint')}
        right={
          link ? null : (
            <Button variant="secondary" size="compact" onClick={() => void create()}>
              {t('settings.setupLink.create')}
            </Button>
          )
        }
      />
      {failed ? (
        <p role="alert" className={styles.sub}>
          {t('settings.setupLink.error')}
        </p>
      ) : null}
      {link ? (
        <div className={styles.linkBox}>
          <input
            className={styles.linkField}
            readOnly
            value={link}
            aria-label={t('settings.setupLink')}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button variant="secondary" onClick={() => void copy()}>
            {copied ? t('settings.setupLink.copied') : t('settings.setupLink.copy')}
          </Button>
          <p className={styles.sub}>{t('settings.setupLink.warning')}</p>
        </div>
      ) : null}
    </Card>
  );
}
