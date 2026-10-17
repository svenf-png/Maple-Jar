import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { normalizeUsername } from '../../data/household';
import { parseProjectUrl } from '../../data/remote/project-url';
import { connect } from '../../data/session';
import { setLang, t, useLang } from '../../i18n/t';
import { Logo } from '../../icons/logo';
import { Button, Card, Segmented, TextField } from '../../ui';
import styles from './ConnectPage.module.css';
import { remoteErrorMessage } from './errors';

export function ConnectPage() {
  const lang = useLang();
  const navigate = useNavigate();
  const [projectUrl, setProjectUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const origin = parseProjectUrl(projectUrl);
    if (!origin) return setError(t('connect.error.url'));
    if (!anonKey.trim()) return setError(t('connect.error.keyMissing'));
    const name = normalizeUsername(username);
    if (!name) return setError(t('connect.error.username'));
    if (!password) return setError(t('connect.error.passwordMissing'));
    setError(null);
    setBusy(true);
    try {
      const result = await connect({
        projectUrl: origin,
        anonKey: anonKey.trim(),
        username: name,
        password,
      });
      if (result.kind === 'ok') void navigate('/', { replace: true });
      else if (result.kind === 'setup') void navigate('/einrichten', { replace: true });
      else if (result.kind === 'join') void navigate('/beitreten', { replace: true });
      else setError(t('connect.error.notMember'));
    } catch (err) {
      setError(remoteErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page} lang={lang}>
      <div className={styles.lang}>
        <Segmented
          label={t('connect.langLabel')}
          value={lang}
          options={[
            { value: 'de', label: 'DE' },
            { value: 'en', label: 'EN' },
          ]}
          onChange={setLang}
        />
      </div>
      <svg
        className={styles.hills}
        viewBox="0 0 390 220"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M0 120 C90 90 170 110 250 95 S360 80 390 92 V220 H0z" fill="var(--hill1)" />
        <path d="M0 170 C80 150 160 160 240 148 S350 140 390 150 V220 H0z" fill="var(--hill2)" />
      </svg>
      <div className={styles.content}>
        <div className={styles.tile}>
          <Logo size={44} />
        </div>
        <div>
          <h1 className={styles.title}>{t('app.name')}</h1>
          <p className={styles.subtitle}>{t('connect.subtitle')}</p>
        </div>
        <form onSubmit={onSubmit} className={styles.form} noValidate>
          <Card className={styles.card}>
            <TextField
              label={t('connect.projectUrl')}
              placeholder={t('connect.projectUrlPlaceholder')}
              type="url"
              inputMode="url"
              value={projectUrl}
              onChange={(e) => setProjectUrl(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
            />
            <TextField
              label={t('connect.anonKey')}
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
            />
            <TextField
              label={t('connect.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
            />
            <TextField
              label={t('connect.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              error={error ?? undefined}
            />
          </Card>
          <Button type="submit" busy={busy}>
            {busy ? t('connect.busy') : t('connect.submit')}
          </Button>
          <Link to="/hilfe" className={styles.help}>
            {t('connect.help')}
          </Link>
        </form>
      </div>
      <p className={styles.footer}>{t('connect.footer')}</p>
    </main>
  );
}
