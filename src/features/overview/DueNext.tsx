import { useEffect, useRef, useState } from 'react';
import { bookDueItems, undoBookedDues } from '../../data/actions';
import { db } from '../../data/db';
import type { FxProvider } from '../../data/fx/frankfurter';
import type { HouseholdMember } from '../../data/household';
import { type DueItem, dueNext } from '../../domain/fixed-cost';
import type { KnownRate } from '../../domain/fx';
import type { Category, Entry, FixedCost } from '../../domain/model';
import { toCadMinor } from '../../domain/money';
import { formatApprox, formatDay, formatMoney } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { ChevronRightIcon, WarnIcon } from '../../icons/ui-icons';
import { fetchKnownRate } from '../../platform/use-fx';
import { Card, CategoryTile, useToast } from '../../ui';
import { amountWithOriginal, dueLabel } from '../shared/plan-format';
import { BookSheet } from './BookSheet';
import styles from './DueNext.module.css';
import sectionStyles from './OverviewPage.module.css';

const HORIZON_DAYS = 14;

interface Props {
  fixedCosts: readonly FixedCost[];
  entries: readonly Entry[];
  categories: readonly Category[];
  members: readonly HouseholdMember[];
  /** Kurs für die Anzeige der EUR-Beträge (heute). */
  displayRate: KnownRate | null;
  provider: FxProvider;
  today: string;
}

export function DueNext({
  fixedCosts,
  entries,
  categories,
  members,
  displayRate,
  provider,
  today,
}: Props) {
  const locale = getLocale();
  const toast = useToast();
  const [items, setItems] = useState<DueItem[]>([]);
  const [open, setOpen] = useState<DueItem | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let alive = true;
    dueNext(fixedCosts, entries, today, HORIZON_DAYS).then((r) => alive && setItems(r));
    return () => {
      alive = false;
    };
  }, [fixedCosts, entries, today]);

  const fcById = new Map(fixedCosts.map((f) => [f.id, f]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const rows = items.flatMap((due) => {
    const fixedCost = fcById.get(due.fixedCostId);
    return fixedCost ? [{ due, fixedCost }] : [];
  });
  if (rows.length === 0 && open === null) return null;
  const sel = open ? rows.find((r) => r.due.entryId === open.entryId) : undefined;
  const overdue = rows.filter((r) => r.due.dueOn < today);
  const upcoming = rows.filter((r) => r.due.dueOn >= today);

  const bookAll = async () => {
    setBusy(true);
    try {
      const { booked, failed } = await bookDueItems(
        db,
        overdue.map((r) => ({ fixedCostId: r.due.fixedCostId, dueOn: r.due.dueOn })),
        provider ? (dueOn) => fetchKnownRate(provider, dueOn) : null,
        today,
      );
      if (booked.length > 0) {
        toast(t('overview.due.bookedAll', { count: booked.length }), {
          label: t('history.undo'),
          onClick: () => void undoBookedDues(db, booked),
        });
      } else if (failed > 0) {
        toast(t('overview.due.bookAllFailed'));
      }
      if (booked.length > 0 && failed > 0) toast(t('overview.due.bookAllFailed'));
      setListOpen(false);
      setTimeout(() => headingRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };

  const months = new Set(overdue.map((r) => r.due.dueOn.slice(0, 7)));
  const month = overdue[0]
    ? formatDay(`${overdue[0].due.dueOn.slice(0, 7)}-01`, locale, { month: 'long' })
    : '';
  const blockTitle =
    months.size > 1
      ? t('overview.due.overdueBlock.mixed', { count: overdue.length })
      : overdue.length === 1
        ? t('overview.due.overdueBlock.one', { month })
        : t('overview.due.overdueBlock', { count: overdue.length, month });
  let sumMinor = 0n;
  let approx = false;
  for (const r of overdue) {
    if (r.fixedCost.currency === 'CAD') sumMinor += BigInt(r.fixedCost.amountMinor);
    else if (displayRate) {
      sumMinor += BigInt(toCadMinor(r.fixedCost.amountMinor, displayRate.rateMicro));
      approx = true;
    } else approx = true;
  }
  const sumText = formatMoney(sumMinor, 'CAD', locale);
  const blockSub = t('overview.due.overdueSum', {
    names: overdue.map((r) => r.fixedCost.name).join(', '),
    sum: approx ? formatApprox(sumText) : sumText,
  });

  const renderRow = ({ due, fixedCost: fc }: { due: DueItem; fixedCost: FixedCost }) => {
    const cat = catById.get(fc.categoryId);
    const amt = amountWithOriginal(fc.amountMinor, fc.currency, displayRate?.rateMicro, locale);
    const amountText = amt.cad
      ? amt.approximate
        ? formatApprox(amt.cad)
        : amt.cad
      : (amt.eur ?? '');
    const whenText = dueLabel(due.dueOn, today, locale);
    return (
      <li key={due.entryId}>
        <button
          type="button"
          className={styles.row}
          onClick={() => setOpen(due)}
          aria-label={`${t('overview.due.book')}: ${fc.name}, ${whenText}, ${amountText}`}
        >
          <CategoryTile icon={cat?.icon ?? 'sonstiges'} color={cat?.color ?? 'var(--label2)'} />
          <span className={styles.text}>
            <span className={styles.name}>{fc.name}</span>
            <span className={styles.when}>{whenText}</span>
          </span>
          <span className={styles.amounts}>
            <span className={`${styles.amount} num`}>{amountText}</span>
            {amt.eur && amt.cad ? <span className={`${styles.orig} num`}>{amt.eur}</span> : null}
          </span>
        </button>
      </li>
    );
  };

  return (
    <section className={sectionStyles.section} aria-labelledby="due-title">
      <div className={sectionStyles.sectionHead}>
        <h2 id="due-title" ref={headingRef} tabIndex={-1} className="type-title2">
          {t('overview.due.title')}
        </h2>
      </div>
      {overdue.length > 0 ? (
        <div className={styles.notice}>
          <div className={styles.noticeBar}>
            <button
              type="button"
              className={styles.noticeMain}
              aria-expanded={listOpen}
              title={t('overview.due.showList')}
              onClick={() => setListOpen((v) => !v)}
            >
              <WarnIcon size={20} />
              <span className={styles.noticeText}>
                <strong>{blockTitle}</strong>
                <span className={`${styles.noticeSub} num`}>{blockSub}</span>
              </span>
              <span
                className={`${styles.chev} ${listOpen ? styles.chevOpen : ''}`}
                aria-hidden="true"
              >
                <ChevronRightIcon size={16} />
              </span>
            </button>
            <button
              type="button"
              className={styles.bookAll}
              disabled={busy}
              onClick={() => void bookAll()}
            >
              {t('overview.due.bookAll')}
            </button>
          </div>
          {listOpen ? <ul className={styles.list}>{overdue.map(renderRow)}</ul> : null}
        </div>
      ) : null}
      {upcoming.length > 0 ? (
        <Card className={sectionStyles.list}>
          <ul className={styles.list}>{upcoming.map(renderRow)}</ul>
        </Card>
      ) : null}
      <BookSheet
        item={sel ?? null}
        category={sel ? catById.get(sel.fixedCost.categoryId) : undefined}
        members={members}
        provider={provider}
        today={today}
        onClose={() => setOpen(null)}
        onBooked={() => setTimeout(() => headingRef.current?.focus(), 0)}
      />
    </section>
  );
}
