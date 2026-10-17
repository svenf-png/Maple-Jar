import { useEffect, useState } from 'react';
import type { ScenarioExtra, ScenarioExtraKind } from '../../domain/model';
import { type Currency, parseDecimalToMinor } from '../../domain/money';
import {
  type ExtraDraft,
  type ExtraError,
  toExtra,
  validateExtra,
} from '../../domain/scenario-view';
import { addDays, addMonths } from '../../domain/schedule';
import { t } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import { Button, Dialog, Segmented, TextField } from '../../ui';
import { AmountFields, DateRow } from '../planning/FormFields';
import { todayIso } from '../shared/helpers';
import styles from './ScenarioPanel.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Wirft der Aufrufer, bleibt der Dialog offen (der Aufrufer meldet den Fehler). */
  onSave: (e: ScenarioExtra) => Promise<void>;
}

interface Form {
  kind: ScenarioExtraKind;
  name: string;
  amount: string;
  currency: Currency;
  on: string;
  targetDate: string;
}

/** Leeres Formular: Datum morgen, Zieldatum sechs Monate nach dem Start. */
function freshForm(): Form {
  const on = addDays(todayIso(), 1);
  return {
    kind: 'expense',
    name: '',
    amount: '',
    currency: 'CAD',
    on,
    targetDate: addMonths(on, 6),
  };
}

/** Dialog für eine Einmalausgabe oder ein neues Sparziel im Szenario. */
export function ExtraDialog({ open, onClose, onSave }: Props) {
  const [form, setForm] = useState<Form>(freshForm);
  const [error, setError] = useState<ExtraError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(freshForm());
      setError(null);
    }
  }, [open]);

  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const isGoal = form.kind === 'goal';

  function submit() {
    const draft: ExtraDraft = {
      kind: form.kind,
      name: form.name,
      amountMinor: parseDecimalToMinor(form.amount),
      currency: form.currency,
      on: form.on,
      targetDate: form.targetDate,
    };
    const problem = validateExtra(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    onSave(toExtra(draft, crypto.randomUUID()))
      .then(() => {
        setForm(freshForm());
        onClose();
      })
      .catch(() => {
        // Der Aufrufer zeigt die Meldung; der Dialog bleibt mit den Eingaben offen.
      })
      .finally(() => setBusy(false));
  }

  return (
    <Dialog open={open} title={t('scen.form.title')} onClose={onClose}>
      <div className={styles.form}>
        <Segmented
          label={t('scen.form.kind')}
          value={form.kind}
          options={[
            { value: 'expense', label: t('scen.form.kind.expense') },
            { value: 'goal', label: t('scen.form.kind.goal') },
          ]}
          onChange={(kind) => update({ kind })}
        />
        <div className={styles.fields}>
          <TextField
            label={t('scen.form.name')}
            value={form.name}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => update({ name: e.target.value })}
          />
          <AmountFields
            label={isGoal ? t('scen.form.target') : t('scen.form.amount')}
            amount={form.amount}
            currency={form.currency}
            onAmount={(amount) => update({ amount })}
            onCurrency={(currency) => update({ currency })}
          />
          {isGoal ? (
            <>
              <DateRow
                label={t('scen.form.start')}
                value={form.on}
                onChange={(on) => update({ on })}
              />
              <DateRow
                label={t('scen.form.targetDate')}
                value={form.targetDate}
                onChange={(targetDate) => update({ targetDate })}
              />
            </>
          ) : (
            <DateRow label={t('scen.form.on')} value={form.on} onChange={(on) => update({ on })} />
          )}
        </div>
        {error ? (
          <p className={styles.formError} role="alert">
            <WarnIcon size={16} />
            <span>{t(`scen.error.${error}`)}</span>
          </p>
        ) : null}
        <Button busy={busy} onClick={submit}>
          {t('scen.form.save')}
        </Button>
        <Button variant="text" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </Dialog>
  );
}
