import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  type Household,
  MEMBER_COLORS,
  type MemberColor,
  periodEndFor,
  sameLogin,
  serializeHousehold,
} from '../../data/household';
import { ConflictError } from '../../data/remote/remote-store';
import { evaluateHousehold, saveHousehold } from '../../data/session';
import { getStore } from '../../data/store-factory';
import { useSession } from '../../data/use-session';
import { t, useLang } from '../../i18n/t';
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
  const [otherLogin, setOtherLogin] = useState('');
  const [otherName, setOtherName] = useState('');
  const [otherColor, setOtherColor] = useState<MemberColor>(MEMBER_COLORS[1]);
  const [fx, setFx] = useState<'ECB' | 'BOC'>('ECB');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session) return null;

  async function afterConflict(): Promise<void> {
    if (!session) return;
    const store = await getStore(session.repo, session.token);
    const file = await store.readFile('household.json');
    if (!file) throw new Error('Missing after conflict');
    const outcome = evaluateHousehold(file.text, file.sha, session.login);
    if (outcome.kind === 'ok') {
      await saveHousehold(outcome.household, outcome.sha);
      void navigate('/', { replace: true });
    } else if (outcome.kind === 'notMember') setError(t('connect.error.notMember'));
    else if (outcome.kind === 'notYetMember') setError(t('connect.error.notYetMember'));
    else setError(t('connect.error.invalidHousehold'));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!name.trim())
      return setError(t('setup.error.required', { field: t('setup.householdName') }));
    if (!myName.trim()) return setError(t('setup.error.required', { field: t('setup.yourName') }));
    const n = Number(months);
    if (!Number.isInteger(n) || n < 1 || n > 60) return setError(t('setup.error.duration'));
    const hasOther = otherLogin.trim() !== '' || otherName.trim() !== '';
    if (hasOther && (!otherLogin.trim() || !otherName.trim())) {
      return setError(t('setup.error.secondIncomplete'));
    }
    if (hasOther && sameLogin(otherLogin.trim(), session.login)) {
      return setError(t('setup.error.secondSame'));
    }
    const periodStart = `${start}-01`;
    const members: Household['members'] = [
      { githubLogin: session.login, displayName: myName.trim(), color: myColor },
    ];
    if (hasOther) {
      members.push({
        githubLogin: otherLogin.trim(),
        displayName: otherName.trim(),
        color: otherColor,
      });
    }
    const household: Household = {
      format: 1,
      householdId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      members,
      settings: {
        name: name.trim(),
        placeLabel: place.trim() || null,
        periodStart,
        periodEnd: periodEndFor(periodStart, n),
        baseCurrency: 'CAD',
        secondCurrency: 'EUR',
        fxProvider: fx,
      },
    };
    setError(null);
    setBusy(true);
    try {
      const store = await getStore(session.repo, session.token);
      try {
        const { sha } = await store.writeFile(
          'household.json',
          serializeHousehold(household),
          null,
          'chore: set up household',
        );
        await saveHousehold(household, sha);
        void navigate('/', { replace: true });
      } catch (err) {
        if (err instanceof ConflictError) await afterConflict();
        else throw err;
      }
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
        <h2 className="type-label">{t('setup.second')}</h2>
        <Card>
          <TextField
            label={t('setup.secondLogin')}
            hint={t('setup.secondHint')}
            value={otherLogin}
            onChange={(e) => setOtherLogin(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
          />
          <TextField
            label={t('setup.secondName')}
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            autoComplete="off"
          />
          <div className={styles.colorRow}>
            <ColorPicker label={t('setup.color')} value={otherColor} onChange={setOtherColor} />
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
