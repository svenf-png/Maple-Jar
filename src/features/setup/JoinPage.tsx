import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { MEMBER_COLORS, type MemberColor } from '../../data/household';
import { joinHousehold } from '../../data/session';
import { getLocale, t, useLang } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import { Button, Card, TextField } from '../../ui';
import { remoteErrorMessage } from '../connect/errors';
import { ColorPicker } from './ColorPicker';
import styles from './SetupPage.module.css';

/** Zweite Person: tritt dem vorhandenen Haushalt beim ersten Login bei. */
export function JoinPage() {
  useLang();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [color, setColor] = useState<MemberColor>(MEMBER_COLORS[1]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t('setup.error.required', { field: t('setup.yourName') }));
    setError(null);
    setBusy(true);
    try {
      await joinHousehold({ displayName: name.trim(), color, locale: getLocale() });
      void navigate('/', { replace: true });
    } catch (err) {
      setError(remoteErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className="type-large-title">{t('join.title')}</h1>
      <p className={styles.intro}>{t('join.intro')}</p>
      <form onSubmit={onSubmit} className={styles.form} noValidate>
        <Card>
          <TextField
            label={t('setup.yourName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <div className={styles.colorRow}>
            <ColorPicker label={t('setup.color')} value={color} onChange={setColor} />
          </div>
        </Card>
        {error ? (
          <p className={styles.error} role="alert">
            <WarnIcon size={18} />
            <span>{error}</span>
          </p>
        ) : null}
        <Button type="submit" busy={busy}>
          {busy ? t('setup.busy') : t('join.submit')}
        </Button>
      </form>
    </main>
  );
}
