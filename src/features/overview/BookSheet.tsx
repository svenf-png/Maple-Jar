import { useState } from 'react';
import { bookFixedCost, deleteEntry, NoHouseholdError, NoRateError } from '../../data/actions';
import { db } from '../../data/db';
import type { FxProvider } from '../../data/fx/frankfurter';
import type { HouseholdMember } from '../../data/household';
import type { DueItem } from '../../domain/fixed-cost';
import { defaultPayer } from '../../domain/fixed-cost';
import type { KnownRate } from '../../domain/fx';
import type { Category, FixedCost } from '../../domain/model';
import { formatDay, formatMoney } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import { useEntryRate } from '../../platform/use-fx';
import { Button, CategoryTile, Segmented, useToast } from '../../ui';
import { BottomSheet } from '../shared/BottomSheet';
import styles from './BookSheet.module.css';

interface Props {
  item: { due: DueItem; fixedCost: FixedCost } | null;
  category: Category | undefined;
  members: readonly HouseholdMember[];
  provider: FxProvider;
  today: string;
  onClose: () => void;
  /** Nach erfolgreicher Buchung (der Aufrufer setzt den Fokus um). */
  onBooked?: () => void;
}

const errorKey = (e: unknown) =>
  e instanceof NoRateError
    ? 'overview.due.noRate'
    : e instanceof NoHouseholdError
      ? 'overview.due.noHousehold'
      : 'overview.due.error';

/** „Als bezahlt buchen“: vorbelegt aus der Fixkosten-Vorlage, bestätigen genügt. */
export function BookSheet({ item, category, members, provider, today, onClose, onBooked }: Props) {
  const toast = useToast();
  const locale = getLocale();
  const [payer, setPayer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fc = item?.fixedCost;
  const dueOn = item?.due.dueOn ?? today;
  const def = defaultPayer(members);
  const chosen = payer ?? def ?? '';
  const rate = useEntryRate(fc?.currency ?? 'CAD', dueOn, provider);
  const loading = fc?.currency === 'EUR' && rate.status === 'loading';

  const close = () => {
    setPayer(null);
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!item || !fc) return;
    setBusy(true);
    setError(null);
    try {
      const known: KnownRate | null = rate.rate;
      const result = await bookFixedCost(db, fc.id, item.due.dueOn, known, {
        ...(chosen && chosen !== def ? { paidBy: chosen } : {}),
        today,
      });
      const entryId = item.due.entryId;
      if (result === 'already') toast(t('overview.due.already'));
      else
        toast(
          t(result === 'restored' ? 'overview.due.restored' : 'overview.due.booked', {
            name: fc.name,
          }),
          {
            label: t('history.undo'),
            onClick: () => void deleteEntry(db, entryId),
          },
        );
      close();
      onBooked?.();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={item !== null} title={t('overview.due.book')} onClose={close}>
      {fc ? (
        <div className={styles.body}>
          <div className={styles.head}>
            <CategoryTile
              icon={category?.icon ?? 'sonstiges'}
              color={category?.color ?? 'var(--label2)'}
              size={40}
            />
            <div className={styles.headText}>
              <strong>{fc.name}</strong>
              <span className={`${styles.big} num`}>
                {formatMoney(fc.amountMinor, fc.currency, locale)}
              </span>
            </div>
          </div>
          <dl className={styles.facts}>
            <dt>{t('overview.due.date')}</dt>
            <dd>{formatDay(dueOn, locale, { weekday: 'short', day: 'numeric', month: 'long' })}</dd>
            <dt>{t('overview.due.category')}</dt>
            <dd>{category?.name ?? ''}</dd>
          </dl>
          {members.length > 1 ? (
            <Segmented
              label={t('overview.due.payer')}
              value={chosen}
              options={members.map((m) => ({ value: m.userId, label: m.displayName }))}
              onChange={setPayer}
            />
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              <WarnIcon size={16} />
              {error}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Button onClick={() => void confirm()} busy={busy} disabled={loading}>
              {loading ? t('overview.due.rateLoading') : t('overview.due.book')}
            </Button>
            <Button variant="text" onClick={close}>
              {t('overview.due.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
