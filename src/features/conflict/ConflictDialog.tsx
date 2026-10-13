import { useEffect, useRef, useState } from 'react';
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
import { differingFields, editsOf, type Version, versionsOf } from './versions';

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
  const row = useLiveQuery(() => db[entity].get(rowId), [entity, rowId], undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState(false);
  const events = useLiveQuery(
    () => db.events.where('[entity+rowId]').equals([entity, rowId]).toArray(),
    [entity, rowId],
    [],
  );
  // Den Konflikt festhalten, solange aufgelöst wird: sonst blitzt „bereits gelöst“ auf, bevor der Dialog schließt.
  const latched = useRef<typeof live>(undefined);
  const live = useConflict(entity, rowId);
  if (live) latched.current = live;
  const conflict = live ?? (busy || resolved ? latched.current : undefined);
  useEffect(() => {
    if (!open) {
      setResolved(false);
      latched.current = undefined;
    }
  }, [open]);

  const finish = () => {
    toast(t('conflict.resolved'));
    setPicked(null);
    setResolved(true);
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

  const isDeleted = row?.deleted === true;
  const versions: Version[] = conflict && row ? versionsOf(conflict, row, events) : [];
  const shown = conflict ? differingFields(conflict, versions) : [];
  const latest = versions.at(-1);

  // Unterscheiden sich die Versionen in keinem sichtbaren Feld, gibt es nichts zu entscheiden: die jüngste gilt.
  const auto = useRef(false);
  useEffect(() => {
    if (!open) auto.current = false;
    if (!open || auto.current || busy || !conflict || conflict.kind !== 'fields') return;
    if (isDeleted || !latest || shown.length > 0) return;
    auto.current = true;
    void run(() => keepVersion(db, entity, rowId, latest.values));
  });

  const sharedAuthor = new Set(versions.map((v) => v.author)).size < versions.length;
  const time = (ms: number) =>
    formatDate(new Date(ms), locale, {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const who = (v: Version) =>
    v.author === userId
      ? t('conflict.yours')
      : t('conflict.versionOf', { name: memberName(household.members, v.author) });

  const show = (field: string, value: unknown, currencyValue: unknown): string => {
    if (value === null || value === undefined || value === '') return t('conflict.none');
    const currency = (currencyValue ?? row?.currency) === 'EUR' ? 'EUR' : 'CAD';
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
  const edits = conflict?.kind === 'deleteVsEdit' ? editsOf(conflict, events) : [];
  const editedCurrency = edits.find((e) => e.field === 'currency')?.after;

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
          {edits.length > 0 ? (
            <>
              <h3 className={styles.subhead}>{t('conflict.edited')}</h3>
              <dl className={`${styles.fields} ${styles.edits}`}>
                {edits.map((e) => (
                  <div key={e.field} style={{ display: 'contents' }}>
                    <dt>{t(LABELS[e.field] ?? 'conflict.field.other')}</dt>
                    <dd>
                      <span className="num">
                        {t('conflict.change', {
                          before: show(e.field, e.before, editedCurrency),
                          after: show(e.field, e.after, editedCurrency),
                        })}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
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
          {isDeleted ? (
            <p className={styles.notice} role="note">
              <WarnIcon size={16} />
              {t('conflict.deletedNotice')}
            </p>
          ) : null}
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
                  {sharedAuthor ? <span className={`${styles.when} num`}>{time(v.at)}</span> : null}
                </span>
                <dl className={styles.fields}>
                  {shown.map((f) => (
                    <div key={f} style={{ display: 'contents' }}>
                      <dt>{t(LABELS[f] ?? 'conflict.field.other')}</dt>
                      <dd>
                        <span className={`${styles.diff} num`}>
                          {show(f, v.values[f], v.values.currency)}
                        </span>
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
                chosen && void run(() => keepVersion(db, entity, rowId, chosen.values))
              }
            >
              {isDeleted ? t('conflict.keepRestore') : t('conflict.keep')}
            </Button>
            {entity === 'entry' ? (
              <Button
                variant="secondary"
                busy={busy}
                onClick={() =>
                  void run(() =>
                    keepBoth(
                      db,
                      rowId,
                      versions.map((v) => ({ eventId: v.eventId, values: v.values })),
                    ),
                  )
                }
              >
                {t('conflict.keepBoth')}
              </Button>
            ) : null}
            {isDeleted && latest ? (
              <Button
                variant="secondary"
                busy={busy}
                onClick={() => void run(() => confirmDelete(db, entity, rowId, latest.values))}
              >
                {t('conflict.keepDeleted')}
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
