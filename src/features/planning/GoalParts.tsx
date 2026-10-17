import { type PlanDeviation, progress, requiredMonthly } from '../../domain/goals';
import type { Goal } from '../../domain/model';
import { formatMoney, formatMonth } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { ProgressBar, StatusPill } from '../../ui';
import { goalStatusView } from '../shared/plan-format';
import styles from './PlanningPage.module.css';

/** Hinweis „X hinter Plan …“ (Amber, Symbol im Pill); bei Überfälligkeit ohne Planmonat. */
export function deviationNote(goal: Pick<Goal, 'currency'>, dev: PlanDeviation): string | null {
  if (dev.behindMinor <= 0n || dev.status === 'reached') return null;
  const locale = getLocale();
  const behind = formatMoney(dev.behindMinor, goal.currency, locale);
  if (dev.backOnPlanMinor == null || dev.backOnPlanMonth == null) {
    return t('goal.behind.overdue', { amount: behind });
  }
  return t('goal.behind.note', {
    amount: behind,
    back: formatMoney(dev.backOnPlanMinor, goal.currency, locale),
    month: formatMonth(dev.backOnPlanMonth, locale),
  });
}

interface Props {
  goal: Goal;
  savedMinor: bigint;
  dev: PlanDeviation;
  today: string;
}

/** Fortschritt, nötige Rate, Status und Abweichungshinweis (Karte und Detail). */
export function GoalStats({ goal, savedMinor, dev, today }: Props) {
  const locale = getLocale();
  const pct = progress(goal, savedMinor);
  const view = goalStatusView(dev.status);
  const note = deviationNote(goal, dev);
  const needed = requiredMonthly(goal, savedMinor, today);
  return (
    <>
      <ProgressBar value={pct} tone="ok" label={t('goal.progress', { name: goal.name })} />
      <div className={styles.statRow}>
        <span>{t('goal.percent', { pct })}</span>
        {needed > 0n ? (
          <span className="num">
            {t('goal.needed', { amount: formatMoney(needed, goal.currency, locale) })}
          </span>
        ) : null}
      </div>
      <div>
        <StatusPill variant={view.variant}>{t(view.key)}</StatusPill>
      </div>
      {note ? <p className={styles.note}>{note}</p> : null}
    </>
  );
}
