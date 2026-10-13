import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  createFixedCost,
  deleteFixedCost,
  InvalidPatchError,
  restoreFixedCost,
  updateFixedCost,
} from '../../data/actions';
import { db } from '../../data/db';
import { useCategories, useFixedCosts, useLoaded } from '../../data/repos';
import type { RepeatUnit } from '../../domain/model';
import { type Currency, parseDecimalToMinor } from '../../domain/money';
import { t, useLang } from '../../i18n/t';
import { type CategoryIconKey, categoryIcons } from '../../icons/category-icons';
import { Button, Chip, TextField, useToast } from '../../ui';
import { ConflictBadge } from '../conflict/ConflictBadge';
import { minorToInput, todayIso } from '../shared/helpers';
import { AmountFields, CheckRow, RepeatFields } from './FormFields';
import { FormError, FormShell } from './FormShell';
import styles from './PlanForm.module.css';
import { checkRepeat } from './plan-helpers';

export function FixedCostFormPage() {
  useLang();
  const navigate = useNavigate();
  const toast = useToast();
  const { id } = useParams();
  const fixedCosts = useFixedCosts();
  const categories = useCategories().filter((c) => !c.deleted);
  const loaded = useLoaded();
  const editing = id ? fixedCosts.find((f) => f.id === id && !f.deleted) : undefined;

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('CAD');
  const [unit, setUnit] = useState<RepeatUnit>('month');
  const [every, setEvery] = useState('1');
  const [categoryId, setCategoryId] = useState('');
  const [startsOn, setStartsOn] = useState(todayIso());
  const [endsOn, setEndsOn] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [autobook, setAutobook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!editing || loadedFor.current === editing.id) return;
    loadedFor.current = editing.id;
    setName(editing.name);
    setAmount(minorToInput(editing.amountMinor));
    setCurrency(editing.currency);
    setUnit(editing.unit);
    setEvery(String(editing.every));
    setCategoryId(editing.categoryId);
    setStartsOn(editing.startsOn);
    setEndsOn(editing.endsOn ?? '');
    setIsSaving(editing.isSaving);
    setAutobook(editing.autobook);
  }, [editing]);
  const visible = categories.filter((c) => !c.hidden || c.id === categoryId);
  useEffect(() => {
    if (!categoryId && !editing && visible[0]) setCategoryId(visible[0].id);
  }, [categoryId, editing, visible]);

  async function save() {
    const amountMinor = parseDecimalToMinor(amount);
    if (!name.trim()) return setError(t('form.error.name'));
    if (!amountMinor) return setError(t('form.error.amount'));
    if (!categoryId) return setError(t('form.error.category'));
    const rep = checkRepeat({ unit, everyText: every, startsOn, endsOn: endsOn || null });
    if (rep.error) return setError(t(rep.error));
    setError(null);
    setBusy(true);
    try {
      const end = unit === 'once' ? '' : endsOn;
      const base = { name, amountMinor, currency, unit, every: rep.every, startsOn, categoryId };
      if (editing) {
        await updateFixedCost(db, editing.id, { ...base, endsOn: end || null, isSaving, autobook });
      } else {
        await createFixedCost(db, {
          ...base,
          ...(end ? { endsOn: end } : {}),
          isSaving,
          autobook,
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
    await deleteFixedCost(db, rowId);
    toast(t('form.deleted', { name: label }), {
      label: t('history.undo'),
      onClick: () => void restoreFixedCost(db, rowId),
    });
    void navigate('/planung', { replace: true });
  }

  if (id && !editing) {
    return (
      <FormShell title={t('fixed.edit.title')} closeTo="/planung">
        {loaded ? <p className={styles.hint}>{t('form.notFound')}</p> : null}
      </FormShell>
    );
  }
  return (
    <FormShell title={t(editing ? 'fixed.edit.title' : 'fixed.new.title')} closeTo="/planung">
      <div className={styles.fields}>
        <TextField
          label={t('form.name')}
          value={name}
          maxLength={80}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
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
      {visible.length === 0 ? (
        <p className={styles.hint}>
          {t('fixed.form.noCategories')}{' '}
          <Link to="/kategorien">{t('capture.createCategories')}</Link>
        </p>
      ) : (
        <fieldset className={styles.chips}>
          <legend className={styles.srOnly}>{t('fixed.form.category')}</legend>
          {visible.map((c) => {
            const Icon =
              categoryIcons[(c.icon in categoryIcons ? c.icon : 'sonstiges') as CategoryIconKey];
            return (
              <Chip
                key={c.id}
                label={c.name}
                color={c.color}
                icon={<Icon size={16} />}
                selected={c.id === categoryId}
                onToggle={() => setCategoryId(c.id)}
              />
            );
          })}
        </fieldset>
      )}
      <div className={styles.fields}>
        <CheckRow
          label={t('fixed.form.isSaving')}
          hint={t('fixed.form.isSavingHint')}
          checked={isSaving}
          onChange={setIsSaving}
        />
        <CheckRow
          label={t('fixed.form.autobook')}
          hint={t('fixed.form.autobookHint')}
          checked={autobook}
          onChange={setAutobook}
        />
      </div>
      {editing?.conflict ? <ConflictBadge entity="fixedCost" rowId={editing.id} /> : null}
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
