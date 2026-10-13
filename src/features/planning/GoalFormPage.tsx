import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { createGoal, InvalidPatchError, updateGoal } from '../../data/actions';
import { db } from '../../data/db';
import { MEMBER_COLORS } from '../../data/household';
import { useGoals, useLoaded } from '../../data/repos';
import { type Currency, parseDecimalToMinor } from '../../domain/money';
import { addMonths } from '../../domain/schedule';
import { t, useLang } from '../../i18n/t';
import { type CategoryIconKey, categoryIcons } from '../../icons/category-icons';
import { Button, TextField } from '../../ui';
import { ColorPicker } from '../setup/ColorPicker';
import { minorToInput, todayIso } from '../shared/helpers';
import { AmountFields, DateRow } from './FormFields';
import { FormError, FormShell } from './FormShell';
import styles from './PlanForm.module.css';
import { goalError } from './plan-helpers';

const GOAL_ICONS = [
  'sparplan',
  'reisen',
  'winter',
  'sonne',
  'koffer',
  'haushalt',
  'geschenke',
  'gesundheit',
  'schild',
  'freizeit',
  'mobilitaet',
  'kleidung',
] as const satisfies readonly CategoryIconKey[];

export function GoalFormPage() {
  useLang();
  const navigate = useNavigate();
  const { id } = useParams();
  const goals = useGoals();
  const loaded = useLoaded();
  const editing = id ? goals.find((g) => g.id === id && !g.deleted) : undefined;
  const today = todayIso();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('sparplan');
  const [color, setColor] = useState<string>(MEMBER_COLORS[0]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('CAD');
  const [startsOn, setStartsOn] = useState(today);
  const [targetDate, setTargetDate] = useState(addMonths(today, 6));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!editing || loadedFor.current === editing.id) return;
    loadedFor.current = editing.id;
    setName(editing.name);
    setIcon(editing.icon);
    setColor(editing.color);
    setAmount(minorToInput(editing.targetMinor));
    setCurrency(editing.currency);
    setStartsOn(editing.startsOn);
    setTargetDate(editing.targetDate);
  }, [editing]);

  async function save() {
    const targetMinor = parseDecimalToMinor(amount);
    const problem = goalError({ name, targetMinor, startsOn, targetDate });
    if (problem || !targetMinor) return setError(t(problem ?? 'form.error.amount'));
    setError(null);
    setBusy(true);
    try {
      const fields = { name, icon, color, targetMinor, currency, startsOn, targetDate };
      if (editing) {
        await updateGoal(db, editing.id, fields);
        void navigate(`/ziel/${editing.id}`, { replace: true });
      } else {
        const newId = await createGoal(db, fields);
        void navigate(`/ziel/${newId}`, { replace: true });
      }
    } catch (err) {
      setError(t(err instanceof InvalidPatchError ? 'form.error.invalid' : 'form.error.save'));
    } finally {
      setBusy(false);
    }
  }

  const closeTo = editing ? `/ziel/${editing.id}` : '/planung';
  if (id && !editing) {
    return (
      <FormShell title={t('goal.edit.title')} closeTo="/planung">
        {loaded ? <p className={styles.hint}>{t('goal.detail.notFound')}</p> : null}
      </FormShell>
    );
  }
  return (
    <FormShell title={t(editing ? 'goal.edit.title' : 'goal.new.title')} closeTo={closeTo}>
      <div className={styles.fields}>
        <TextField
          label={t('form.name')}
          value={name}
          maxLength={80}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        <AmountFields
          label={t('goal.form.target')}
          amount={amount}
          currency={currency}
          onAmount={setAmount}
          onCurrency={setCurrency}
        />
        <DateRow label={t('goal.form.startsOn')} value={startsOn} onChange={setStartsOn} />
        <DateRow label={t('goal.form.targetDate')} value={targetDate} onChange={setTargetDate} />
        <div className={styles.block}>
          <span className={styles.blockLabel}>{t('goal.form.icon')}</span>
          <div role="group" aria-label={t('goal.form.icon')} className={styles.icons}>
            {GOAL_ICONS.map((key) => {
              const Icon = categoryIcons[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.iconBtn}
                  aria-pressed={icon === key}
                  aria-label={t(`goal.icon.${key}`)}
                  onClick={() => setIcon(key)}
                >
                  <Icon size={22} />
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.block}>
          <span className={styles.blockLabel}>{t('goal.form.color')}</span>
          <ColorPicker label={t('goal.form.color')} value={color} onChange={setColor} />
        </div>
      </div>
      <FormError message={error} />
      <Button busy={busy} onClick={() => void save()}>
        {t('common.save')}
      </Button>
    </FormShell>
  );
}
