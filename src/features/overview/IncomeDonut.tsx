import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  useBudgets,
  useContributions,
  useFixedCosts,
  useGoals,
  useIncomes,
} from '../../data/repos';
import { coverageByFixedCost, type OccurrenceIds, occurrenceIds } from '../../domain/fixed-cost';
import type { KnownRate } from '../../domain/fx';
import { type IncomeSplit, incomeSplit } from '../../domain/income-split';
import { type Entry, monthOf } from '../../domain/model';
import { formatApprox, formatMoney } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import { DonutChart } from './DonutChart';
import { legendRows } from './donut-model';
import styles from './IncomeDonut.module.css';

/** Anteil am Einkommen für den laufenden Monat. `null`, bis die Fälligkeits-IDs (async) berechnet sind. */
export function useIncomeSplit(
  entries: readonly Entry[],
  today: string,
  rate: KnownRate | null,
): IncomeSplit | null {
  const incomes = useIncomes();
  const fixedCosts = useFixedCosts();
  const goals = useGoals();
  const contributions = useContributions();
  const budgets = useBudgets();
  const [ids, setIds] = useState<{ ids: OccurrenceIds; covered: Map<string, string> } | null>(null);

  useEffect(() => {
    let alive = true;
    const live = fixedCosts.filter((f) => !f.deleted);
    Promise.all([
      occurrenceIds(fixedCosts, monthOf(today), today),
      coverageByFixedCost(live, entries, today),
    ]).then(([i, covered]) => alive && setIds({ ids: i, covered }));
    return () => {
      alive = false;
    };
  }, [fixedCosts, entries, today]);

  return useMemo(
    () =>
      ids
        ? incomeSplit({
            incomes,
            fixedCosts,
            entries,
            contributions,
            goals,
            budgets,
            today,
            rate,
            fixedEntryIds: ids.ids,
            coveredUntil: ids.covered,
          })
        : null,
    [ids, incomes, fixedCosts, entries, contributions, goals, budgets, today, rate],
  );
}

const SEG_LABEL = {
  fixed: 'donut.seg.fixed',
  budget: 'donut.seg.budget',
  other: 'donut.seg.other',
  saving: 'donut.seg.saving',
  free: 'donut.seg.free',
} as const;

function ariaSentence(split: IncomeSplit): string {
  const locale = getLocale();
  const parts = legendRows(split)
    .map((r) => t('donut.part', { label: t(SEG_LABEL[r.kind]), percent: r.percent }))
    .join(', ');
  const total = formatMoney(split.totalCadMinor, 'CAD', locale);
  if (split.mode === 'noIncome') return t('donut.aria.noIncome', { total, parts });
  if (split.mode === 'overflow' && split.overflow) {
    return t('donut.aria.overflow', {
      total,
      over: formatMoney(split.overflow.cadMinor, 'CAD', locale),
      parts,
    });
  }
  return t('donut.aria.normal', { total, parts });
}

export function IncomeDonutChart({ split }: { split: IncomeSplit }) {
  return (
    <DonutChart
      slices={split.segments.map((s) => ({ kind: s.kind, value: Number(s.cadMinor) }))}
      overflowPercent={split.overflow?.percentOfTotal ?? null}
      label={ariaSentence(split)}
    />
  );
}

export function IncomeLegend({ split }: { split: IncomeSplit }) {
  const locale = getLocale();
  const money = (minor: bigint) => {
    const text = formatMoney(minor, 'CAD', locale);
    return split.approximate ? formatApprox(text) : text;
  };
  return (
    <div className={styles.legendBox}>
      <ul className={styles.legend}>
        {legendRows(split).map((r) => (
          <li key={r.kind} className={styles.row} data-kind={r.kind}>
            <span className={`${styles.swatch} ${styles[r.kind]}`} aria-hidden="true" />
            <span className={styles.label}>{t(SEG_LABEL[r.kind])}</span>
            <span className={`${styles.amount} num`}>{money(r.cadMinor)}</span>
            <span className={`${styles.percent} num`}>
              {t('donut.pct', { percent: r.percent })}
            </span>
          </li>
        ))}
        {split.overflow ? (
          <li className={`${styles.row} ${styles.warnRow}`} data-kind="overflow">
            <WarnIcon size={16} />
            <span className={styles.label}>
              {t('donut.overflow', {
                amount: money(split.overflow.cadMinor),
                percent: split.overflow.percentOfTotal,
              })}
            </span>
          </li>
        ) : null}
      </ul>
      {split.mode === 'noIncome' ? (
        <p className={styles.hint}>
          {t('donut.noIncome')}{' '}
          <Link to="/einnahme/neu" className={styles.hintLink}>
            {t('donut.addIncome')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
