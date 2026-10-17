import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { renewLogin } from '../../data/session';
import { afterReauth } from '../../data/sync/control';
import { useReadySession } from '../../data/use-session';
import { t, useLang } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import { Button, Card, TextField } from '../../ui';
import styles from '../setup/SetupPage.module.css';
import { remoteErrorMessage } from './errors';

/** Anmeldung erneuern: gleiches Konto, lokale Daten und Outbox bleiben erhalten. */
export function RenewPage() {
  useLang();
  const navigate = useNavigate();
  const { username } = useReadySession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) return setError(t('connect.error.passwordMissing'));
    setError(null);
    setBusy(true);
    try {
      await renewLogin(password);
      afterReauth();
      void navigate('/', { replace: true });
    } catch (err) {
      setError(remoteErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <Link to="/" className={styles.intro}>
        {t('help.back')}
      </Link>
      <h1 className="type-large-title">{t('renew.title')}</h1>
      <p className={styles.intro}>{t('renew.intro')}</p>
      <form onSubmit={onSubmit} className={styles.form} noValidate>
        <Card>
          <TextField
            label={t('connect.username')}
            value={username}
            readOnly
            autoComplete="username"
          />
          <TextField
            label={t('connect.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Card>
        {error ? (
          <p className={styles.error} role="alert">
            <WarnIcon size={18} />
            <span>{error}</span>
          </p>
        ) : null}
        <Button type="submit" busy={busy}>
          {busy ? t('connect.busy') : t('renew.submit')}
        </Button>
      </form>
    </main>
  );
}
