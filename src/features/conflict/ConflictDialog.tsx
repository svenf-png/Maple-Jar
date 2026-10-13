import { useState } from 'react';
import {
  type ConflictEntity,
  confirmDelete,
  keepBoth,
  keepVersion,
  restoreRow,
} from '../../data/conflict-actions';
import { db } from '../../data/db';
import { useCategories } from '../../data/repos';
import { useLiveQuery } from '../../data/use-live-query';
import { useReadySession } from '../../data/use-session';
import { formatDate, formatDay, formatMoney, formatRate } from '../../i18n/format';
import type { PlanKey } from '../../i18n/plan-de';
import { getLocale, t, useLang } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import { Button, useToast } from '../../ui';
import { BottomSheet } from '../shared/BottomSheet';
import { memberName } from '../shared/helpers';
import styles from './ConflictDialog.module.css';
import { useConflict } from './use-conflict';
import { differingFields, type Version, versionsOf } from './versions';

export type { ConflictEntity };

interface Props {
  entity: ConflictEntity;
  rowId: string;
  open: boolean;
  onClose: () => void;
}

const LABELS: Record<string, PlanKey> = {
  amountMinor: 'conflict.field.amount',
  targetMinor: 'conflict.field.target',
  currency: 'conflict.field.currency',
  fxRateMicro: 'conflict.field.rate',
  bookedOn: 'conflict.field.date',
  categoryId: 'conflict.field.category',
  paidBy: 'conflict.field.paidBy',
  memberId: 'conflict.field.member',
  merchant: 'conflict.field.merchant',
  note: 'conflict.field.note',
  name: 'conflict.field.name',
  icon: 'conflict.field.icon',
  color: 'conflict.field.color',
  unit: 'conflict.field.unit',
  every: 'conflict.field.every',
  startsOn: 'conflict.field.startsOn',
  endsOn: 'conflict.field.endsOn',
  targetDate: 'conflict.field.targetDate',
  archivedAt: 'conflict.field.archivedAt',
  isSaving: 'conflict.field.isSaving',
  autobook: 'conflict.field.autobook',
};

const DAY_FIELDS = new Set(['bookedOn', 'startsOn', 'endsOn', 'targetDate', 'archivedAt']);
const MONEY_FIELDS = new Set(['amountMinor', 'targetMinor']);
const UNIT_KEYS: Record<string, PlanKey> = {
  once: 'plan.repeat.once',
  week: 'plan.repeat.week',
  month: 'plan.repeat.month',
  year: 'plan.repeat.year',
};

export function ConflictDialog({ entity, rowId, open, onClose }: Props) {
  useLang();
  const locale = getLocale();
  const toast = useToast();
  const { household, userId } = useReadySession();
  const categories = useCategories();
  const conflict = useConflict(entity, rowId);
  const row = useLiveQuery(() => db[entity].get(rowId), [entity, rowId], undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const finish = () => {
    toast(t('conflict.resolved'));
    setPicked(null);
    onClose();
  };
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
      finish();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const versions: Version[] = conflict && row ? versionsOf(conflict, row) : [];
  const shown = conflict ? differingFields(conflict, versions) : [];
  const sameAuthor = new Set(versions.map((v) => v.author)).size < versions.length;
  const time = (ms: number) =>
    formatDate(new Date(ms), locale, {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const who = (v: Version) =>
    sameAuthor
      ? t('conflict.versionAt', { time: time(v.at) })
      : v.author === userId
        ? t('conflict.yours')
        : t('conflict.versionOf', { name: memberName(household.members, v.author) });

  const show = (field: string, v: Version): string => {
    const value = v.values[field];
    if (value === null || value === undefined || value === '') return t('conflict.none');
    const currency = (v.values.currency ?? row?.currency) === 'EUR' ? 'EUR' : 'CAD';
    if (MONEY_FIELDS.has(field) && typeof value === 'number')
      return formatMoney(value, currency, locale);
    if (field === 'fxRateMicro' && typeof value === 'number')
      return formatRate(BigInt(value), locale);
    if (DAY_FIELDS.has(field) && typeof value === 'string')
      return formatDay(value, locale, { day: 'numeric', month: 'short', year: 'numeric' });
    if (field === 'categoryId') return categories.find((c) => c.id === value)?.name ?? '';
    if (field === 'paidBy' || field === 'memberId')
      return memberName(household.members, String(value));
    if (field === 'unit') return t(UNIT_KEYS[String(value)] ?? 'conflict.none');
    if (typeof value === 'boolean') return t(value ? 'conflict.yes' : 'conflict.no');
    return String(value);
  };

  const chosen = versions.find((v) => v.eventId === picked);
  const others = versions.filter((v) => v.eventId !== picked);
  const valuesOf = (v: Version) => v.values;

  return (
    <BottomSheet
      open={open}
      title={conflict?.kind === 'deleteVsEdit' ? t('conflict.deleteTitle') : t('conflict.heading')}
      onClose={onClose}
    >
      {!conflict ? (
        <>
          <p className={styles.intro}>{t('conflict.gone')}</p>
          <Button variant="secondary" onClick={onClose}>
            {t('conflict.close')}
          </Button>
        </>
      ) : conflict.kind === 'deleteVsEdit' ? (
        <>
          <p className={styles.intro}>{t('conflict.deleteText')}</p>
          {failed ? <FailNote /> : null}
          <div className={styles.actions}>
            <Button busy={busy} onClick={() => void run(() => restoreRow(db, entity, rowId))}>
              {t('conflict.restore')}
            </Button>
            <Button
              variant="secondary"
              busy={busy}
              onClick={() => void run(() => confirmDelete(db, entity, rowId))}
            >
              {t('conflict.keepDeleted')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.intro}>{t('conflict.intro')}</p>
          <fieldset className={styles.versions}>
            <legend className={styles.legend}>{t('conflict.pick')}</legend>
            {versions.map((v) => (
              <label key={v.eventId} className={styles.version}>
                <span className={styles.head}>
                  <input
                    type="radio"
                    name="conflict-version"
                    checked={picked === v.eventId}
                    onChange={() => setPicked(v.eventId)}
                  />
                  <span className={styles.who}>{who(v)}</span>
                  <span className={`${styles.when} num`}>{time(v.at)}</span>
                </span>
                <dl className={styles.fields}>
                  {shown.map((f) => (
                    <div key={f} style={{ display: 'contents' }}>
                      <dt>{t(LABELS[f] ?? 'conflict.field.other')}</dt>
                      <dd>
                        <span className={`${styles.diff} num`}>{show(f, v)}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </label>
            ))}
          </fieldset>
          <p className={styles.hint}>{t('conflict.hint')}</p>
          {failed ? <FailNote /> : null}
          <div className={styles.actions}>
            <Button
              busy={busy}
              disabled={!chosen}
              onClick={() =>
                chosen && void run(() => keepVersion(db, entity, rowId, valuesOf(chosen)))
              }
            >
              {t('conflict.keep')}
            </Button>
            {entity === 'entry' ? (
              <Button
                variant="secondary"
                busy={busy}
                disabled={!chosen}
                onClick={() =>
                  chosen &&
                  void run(() => keepBoth(db, rowId, valuesOf(chosen), others.map(valuesOf)))
                }
              >
                {t('conflict.keepBoth')}
              </Button>
            ) : null}
            <Button variant="text" onClick={onClose}>
              {t('conflict.later')}
            </Button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

function FailNote() {
  return (
    <p className={styles.error} role="alert">
      <WarnIcon size={16} />
      {t('conflict.failed')}
    </p>
  );
}
