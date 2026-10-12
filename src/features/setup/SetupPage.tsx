import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { MEMBER_COLORS, type MemberColor, periodEndFor } from '../../data/household';
import { createHousehold } from '../../data/session';
import { useSession } from '../../data/use-session';
import { getLocale, t, useLang } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import { Button, Card, Segmented, TextField } from '../../ui';
import { remoteErrorMessage } from '../connect/errors';
import { ColorPicker } from './ColorPicker';
import styles from './SetupPage.module.css';

const currentMonth = () => new Date().toISOString().slice(0, 7);

export function SetupPage() {
  useLang();
  const navigate = useNavigate();
  const session = useSession();
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [start, setStart] = useState(currentMonth());
  const [months, setMonths] = useState('12');
  const [myName, setMyName] = useState('');
  const [myColor, setMyColor] = useState<MemberColor>(MEMBER_COLORS[0]);
  const [fx, setFx] = useState<'ECB' | 'BOC'>('ECB');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim())
      return setError(t('setup.error.required', { field: t('setup.householdName') }));
    if (!myName.trim()) return setError(t('setup.error.required', { field: t('setup.yourName') }));
    const n = Number(months);
    if (!Number.isInteger(n) || n < 1 || n > 60) return setError(t('setup.error.duration'));
    const periodStart = `${start}-01`;
    setError(null);
    setBusy(true);
    try {
      await createHousehold({
        displayName: myName.trim(),
        color: myColor,
        locale: getLocale(),
        settings: {
          name: name.trim(),
          placeLabel: place.trim() || null,
          periodStart,
          periodEnd: periodEndFor(periodStart, n),
          baseCurrency: 'CAD',
          secondCurrency: 'EUR',
          fxProvider: fx,
        },
      });
      void navigate('/', { replace: true });
    } catch (err) {
      const message = remoteErrorMessage(err);
      setError(message === t('connect.error.unknown') ? t('setup.error.write') : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className="type-large-title">{t('setup.title')}</h1>
      <p className={styles.intro}>{t('setup.intro')}</p>
      <form onSubmit={onSubmit} className={styles.form} noValidate>
        <Card>
          <TextField
            label={t('setup.householdName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <TextField
            label={`${t('setup.place')} (${t('common.optional')})`}
            hint={t('setup.placeHint', { place: t('setup.placeExample') })}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            autoComplete="off"
          />
          <TextField
            label={t('setup.startMonth')}
            type="month"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <TextField
            label={t('setup.duration')}
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </Card>
        <h2 className="type-label">{t('setup.you')}</h2>
        <Card>
          <TextField
            label={t('setup.yourName')}
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
            autoComplete="off"
          />
          <div className={styles.colorRow}>
            <ColorPicker label={t('setup.color')} value={myColor} onChange={setMyColor} />
          </div>
        </Card>
        <div className={styles.fx}>
          <span className="type-label">{t('setup.fxProvider')}</span>
          <Segmented
            label={t('setup.fxProvider')}
            value={fx}
            options={[
              { value: 'ECB', label: t('setup.fx.ECB') },
              { value: 'BOC', label: t('setup.fx.BOC') },
            ]}
            onChange={setFx}
          />
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            <WarnIcon size={18} />
            <span>{error}</span>
          </p>
        ) : null}
        <Button type="submit" busy={busy}>
          {busy ? t('setup.busy') : t('setup.submit')}
        </Button>
      </form>
    </main>
  );
}
