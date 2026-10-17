import { useId } from 'react';
import type { RepeatUnit } from '../../domain/model';
import type { Currency } from '../../domain/money';
import { t } from '../../i18n/t';
import { CalendarIcon } from '../../icons/ui-icons';
import { Segmented, TextField } from '../../ui';
import styles from './PlanForm.module.css';

export function AmountFields(props: {
  label: string;
  amount: string;
  currency: Currency;
  onAmount: (v: string) => void;
  onCurrency: (c: Currency) => void;
  currencyLocked?: boolean;
}) {
  return (
    <div className={styles.amountRow}>
      <TextField
        label={props.label}
        inputMode="decimal"
        autoComplete="off"
        value={props.amount}
        onChange={(e) => props.onAmount(e.target.value)}
      />
      <fieldset className={styles.lock} disabled={props.currencyLocked === true}>
        <Segmented
          label={t('form.currency')}
          value={props.currency}
          options={[
            { value: 'CAD', label: 'CAD' },
            { value: 'EUR', label: 'EUR' },
          ]}
          onChange={props.onCurrency}
        />
        {props.currencyLocked ? (
          <p className={styles.hint}>{t('goal.form.currencyLocked')}</p>
        ) : null}
      </fieldset>
    </div>
  );
}

export function DateRow(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  action?: { label: string; onClick: () => void } | undefined;
}) {
  const id = useId();
  return (
    <div className={styles.row}>
      <CalendarIcon size={20} />
      <label htmlFor={id} className={styles.rowLabel}>
        {props.label}
      </label>
      <input
        id={id}
        type="date"
        className={styles.dateInput}
        value={props.value}
        max="2099-12-31"
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.action && props.value ? (
        <button type="button" className={styles.linkBtn} onClick={props.action.onClick}>
          {props.action.label}
        </button>
      ) : null}
    </div>
  );
}

const UNITS: readonly RepeatUnit[] = ['month', 'week', 'year', 'once'];

/** Wiederholung (Einheit, Intervall) plus Start und optionales Ende. */
export function RepeatFields(props: {
  unit: RepeatUnit;
  every: string;
  startsOn: string;
  endsOn: string;
  onUnit: (u: RepeatUnit) => void;
  onEvery: (v: string) => void;
  onStartsOn: (v: string) => void;
  onEndsOn: (v: string) => void;
}) {
  const selectId = useId();
  return (
    <>
      <div className={styles.row}>
        <label htmlFor={selectId} className={styles.rowLabel}>
          {t('form.repeat')}
        </label>
        <select
          id={selectId}
          className={styles.select}
          value={props.unit}
          onChange={(e) => props.onUnit(e.target.value as RepeatUnit)}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {t(`plan.repeat.${u}`)}
            </option>
          ))}
        </select>
      </div>
      {props.unit !== 'once' ? (
        <TextField
          label={t('form.every')}
          hint={t('form.everyHint')}
          inputMode="numeric"
          autoComplete="off"
          value={props.every}
          onChange={(e) => props.onEvery(e.target.value)}
        />
      ) : null}
      <DateRow label={t('form.startsOn')} value={props.startsOn} onChange={props.onStartsOn} />
      {props.unit !== 'once' ? (
        <DateRow
          label={t('form.endsOn')}
          value={props.endsOn}
          onChange={props.onEndsOn}
          action={{ label: t('form.clearEnd'), onClick: () => props.onEndsOn('') }}
        />
      ) : null}
    </>
  );
}

export function CheckRow(props: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className={styles.checkText}>
        <span>{props.label}</span>
        <span className={styles.checkHint}>{props.hint}</span>
      </span>
    </label>
  );
}
