import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  createIncome,
  deleteIncome,
  InvalidPatchError,
  restoreIncome,
  updateIncome,
} from '../../data/actions';
import { db } from '../../data/db';
import { useIncomes, useLoaded } from '../../data/repos';
import { useReadySession } from '../../data/use-session';
import type { RepeatUnit } from '../../domain/model';
import { type Currency, parseDecimalToMinor } from '../../domain/money';
import { t, useLang } from '../../i18n/t';
import { Button, Segmented, TextField, useToast } from '../../ui';
import { ConflictBadge } from '../conflict/ConflictBadge';
import { minorToInput, todayIso } from '../shared/helpers';
import { AmountFields, RepeatFields } from './FormFields';
import { FormError, FormShell } from './FormShell';
import styles from './PlanForm.module.css';
import { checkRepeat } from './plan-helpers';

const NONE = '';

export function IncomeFormPage() {
  useLang();
  const navigate = useNavigate();
  const toast = useToast();
  const { id } = useParams();
  const { household } = useReadySession();
  const incomes = useIncomes();
  const loaded = useLoaded();
  const editing = id ? incomes.find((i) => i.id === id && !i.deleted) : undefined;

  const [name, setName] = useState('');
  const [memberId, setMemberId] = useState<string>(NONE);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('CAD');
  const [unit, setUnit] = useState<RepeatUnit>('month');
  const [every, setEvery] = useState('1');
  const [startsOn, setStartsOn] = useState(todayIso());
  const [endsOn, setEndsOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!editing || loadedFor.current === editing.id) return;
    loadedFor.current = editing.id;
    setName(editing.name);
    setMemberId(editing.memberId ?? NONE);
    setAmount(minorToInput(editing.amountMinor));
    setCurrency(editing.currency);
    setUnit(editing.unit);
    setEvery(String(editing.every));
    setStartsOn(editing.startsOn);
    setEndsOn(editing.endsOn ?? '');
  }, [editing]);

  async function save() {
    const amountMinor = parseDecimalToMinor(amount);
    if (!name.trim()) return setError(t('form.error.name'));
    if (!amountMinor) return setError(t('form.error.amount'));
    const rep = checkRepeat({ unit, everyText: every, startsOn, endsOn: endsOn || null });
    if (rep.error) return setError(t(rep.error));
    setError(null);
    setBusy(true);
    try {
      const end = unit === 'once' ? '' : endsOn;
      const base = { name, amountMinor, currency, unit, every: rep.every, startsOn };
      if (editing) {
        await updateIncome(db, editing.id, {
          ...base,
          endsOn: end || null,
          memberId: memberId || null,
        });
      } else {
        await createIncome(db, {
          ...base,
          ...(end ? { endsOn: end } : {}),
          ...(memberId ? { memberId } : {}),
        });
      }
      void navigate('/planung', { replace: true });
    } catch (err) {
      setError(t(err instanceof InvalidPatchError ? 'form.error.invalid' : 'form.error.save'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    const { id: rowId, name: label } = editing;
    await deleteIncome(db, rowId);
    toast(t('form.deleted', { name: label }), {
      label: t('history.undo'),
      onClick: () => void restoreIncome(db, rowId),
    });
    void navigate('/planung', { replace: true });
  }

  if (id && !editing) {
    return (
      <FormShell title={t('income.edit.title')} closeTo="/planung">
        {loaded ? <p className={styles.hint}>{t('form.notFound')}</p> : null}
      </FormShell>
    );
  }
  return (
    <FormShell title={t(editing ? 'income.edit.title' : 'income.new.title')} closeTo="/planung">
      <div className={styles.fields}>
        <TextField
          label={t('form.name')}
          value={name}
          maxLength={80}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('income.form.member')}</span>
          <Segmented
            label={t('income.form.member')}
            value={memberId}
            options={[
              ...household.members.map((m) => ({ value: m.userId, label: m.displayName })),
              { value: NONE, label: t('form.noMember') },
            ]}
            onChange={setMemberId}
          />
        </div>
        <AmountFields
          label={t('form.amount')}
          amount={amount}
          currency={currency}
          onAmount={setAmount}
          onCurrency={setCurrency}
        />
        <RepeatFields
          unit={unit}
          every={every}
          startsOn={startsOn}
          endsOn={endsOn}
          onUnit={setUnit}
          onEvery={setEvery}
          onStartsOn={setStartsOn}
          onEndsOn={setEndsOn}
        />
      </div>
      {editing?.conflict ? <ConflictBadge entity="income" rowId={editing.id} /> : null}
      <FormError message={error} />
      <Button busy={busy} onClick={() => void save()}>
        {t('common.save')}
      </Button>
      {editing ? (
        <Button variant="secondary" onClick={() => void remove()}>
          {t('form.delete')}
        </Button>
      ) : null}
    </FormShell>
  );
}
