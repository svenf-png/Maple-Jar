import { useEffect, useRef, useState } from 'react';
import type { FxProvider } from '../../data/fx/frankfurter';
import type { HouseholdMember } from '../../data/household';
import { type DueItem, dueNext } from '../../domain/fixed-cost';
import type { KnownRate } from '../../domain/fx';
import type { Category, Entry, FixedCost } from '../../domain/model';
import { formatApprox } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import { Card, CategoryTile } from '../../ui';
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
  const [items, setItems] = useState<DueItem[]>([]);
  const [open, setOpen] = useState<DueItem | null>(null);
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

  return (
    <section className={sectionStyles.section} aria-labelledby="due-title">
      <div className={sectionStyles.sectionHead}>
        <h2 id="due-title" ref={headingRef} tabIndex={-1} className="type-title2">
          {t('overview.due.title')}
        </h2>
      </div>
      <Card className={sectionStyles.list}>
        <ul className={styles.list}>
          {rows.map(({ due, fixedCost: fc }) => {
            const cat = catById.get(fc.categoryId);
            const amt = amountWithOriginal(
              fc.amountMinor,
              fc.currency,
              displayRate?.rateMicro,
              locale,
            );
            const overdue = due.dueOn < today;
            const amountText = amt.cad
              ? amt.approximate
                ? formatApprox(amt.cad)
                : amt.cad
              : (amt.eur ?? '');
            const whenText = `${overdue ? `${t('overview.due.overdue')} · ` : ''}${dueLabel(due.dueOn, today, locale)}`;
            return (
              <li key={due.entryId}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => setOpen(due)}
                  aria-label={`${t('overview.due.book')}: ${fc.name}, ${whenText}, ${amountText}`}
                >
                  <CategoryTile
                    icon={cat?.icon ?? 'sonstiges'}
                    color={cat?.color ?? 'var(--label2)'}
                  />
                  <span className={styles.text}>
                    <span className={styles.name}>{fc.name}</span>
                    <span className={`${styles.when} ${overdue ? styles.overdue : ''}`}>
                      {overdue ? <WarnIcon size={14} /> : null}
                      {whenText}
                    </span>
                  </span>
                  <span className={styles.amounts}>
                    <span className={`${styles.amount} num`}>{amountText}</span>
                    {amt.eur && amt.cad ? (
                      <span className={`${styles.orig} num`}>{amt.eur}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
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
