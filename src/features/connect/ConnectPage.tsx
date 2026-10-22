import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { normalizeUsername } from '../../data/household';
import { parseProjectUrl } from '../../data/remote/project-url';
import { connect } from '../../data/session';
import {
  clearPendingProject,
  loadPendingProject,
  type ProjectConfig,
  parseSetupLink,
  projectHost,
  savePendingProject,
} from '../../data/setup-link';
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
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState(false);
  /** `undefined`: wird geladen, `null`: kein gespeicherter Zugang (manuelle Eingabe). */
  const [saved, setSaved] = useState<ProjectConfig | null | undefined>(undefined);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Einrichtungslink im Fragment (`#/verbinden?u=…&k=…`) übernehmen und sofort aus der Adresszeile entfernen.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const fromLink = parseSetupLink(window.location.hash);
      if (fromLink) {
        await savePendingProject(fromLink);
        void navigate('/verbinden', { replace: true });
      }
      const config = fromLink ?? (await loadPendingProject());
      if (alive) setSaved(config);
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  async function applyLink(value: string) {
    setLink(value);
    if (!value.trim()) return setLinkError(false);
    const config = parseSetupLink(value);
    setLinkError(config === null);
    if (!config) return;
    await savePendingProject(config);
    setLink('');
    setSaved(config);
  }

  async function forgetProject() {
    await clearPendingProject();
    setSaved(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const origin = saved ? saved.projectUrl : parseProjectUrl(projectUrl);
    const key = saved ? saved.anonKey : anonKey.trim();
    if (!origin) return setError(t('connect.error.url'));
    if (!key) return setError(t('connect.error.keyMissing'));
    const name = normalizeUsername(username);
    if (!name) return setError(t('connect.error.username'));
    if (!password) return setError(t('connect.error.passwordMissing'));
    setError(null);
    setBusy(true);
    try {
      const result = await connect({
        projectUrl: origin,
        anonKey: key,
        username: name,
        password,
      });
      await clearPendingProject();
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
            {saved ? (
              <div className={styles.project}>
                <span>{t('connect.project', { host: projectHost(saved.projectUrl) })}</span>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => void forgetProject()}
                >
                  {t('connect.otherProject')}
                </button>
              </div>
            ) : saved === null ? (
              <>
                <TextField
                  label={t('connect.link')}
                  hint={t('connect.linkHint')}
                  value={link}
                  onChange={(e) => void applyLink(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                  error={linkError ? t('connect.error.link') : undefined}
                />
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
              </>
            ) : null}
            <TextField
              label={t('connect.username')}
              name="username"
              enterKeyHint="next"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
            />
            <TextField
              label={t('connect.password')}
              name="password"
              enterKeyHint="go"
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
