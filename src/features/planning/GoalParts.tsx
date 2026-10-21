import { type PlanDeviation, progress, requiredMonthly } from '../../domain/goals';
import type { Goal } from '../../domain/model';
import { formatMoney, formatMoneyShort, formatMoneySplit, formatMonth } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { CategoryTile, ProgressBar, StatusPill } from '../../ui';
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

/**
 * Sparziel als Kartenkörper (Planung und Übersicht): Zeile 1 Symbol, Name und „gespart / Ziel“,
 * Zeile 2 Balken, Zeile 3 Fortschritt mit Zieldatum und nötige Monatsrate, darunter höchstens ein Chip.
 * Der Name kürzt mit Ellipsis, Beträge und Zeilen 3 brechen nie mitten im Betrag um.
 */
export function GoalCardBody({ goal, savedMinor, dev, today }: Props) {
  const locale = getLocale();
  const pct = progress(goal, savedMinor);
  const view = goalStatusView(dev.status);
  const needed = requiredMonthly(goal, savedMinor, today);
  const behind = dev.behindMinor > 0n && dev.status !== 'reached';
  const chip = behind
    ? t('goal.behind.chip', { amount: formatMoneyShort(dev.behindMinor, goal.currency, locale) })
    : t(view.key);
  const chipVariant = behind ? 'warn' : view.variant;
  return (
    <>
      <span className={styles.goalHead}>
        <CategoryTile icon={goal.icon} color={goal.color} size={44} />
        <span className={styles.goalText}>
          <span className={styles.rowTitle}>{goal.name}</span>
        </span>
        <span className={`${styles.amount} ${styles.nowrap} num`}>
          {formatMoneySplit(savedMinor, goal.currency, locale, { trimWhole: true }).amount} /{' '}
          {formatMoneyShort(goal.targetMinor, goal.currency, locale)}
        </span>
      </span>
      <ProgressBar value={pct} tone="ok" label={t('goal.progress', { name: goal.name })} />
      <span className={styles.statRow}>
        <span className={styles.nowrap}>
          {t('goal.statLine', { pct, date: formatMonth(goal.targetDate, locale) })}
        </span>
        {needed > 0n ? (
          <span className={`${styles.nowrap} num`}>
            {t('goal.neededShort', { amount: formatMoneyShort(needed, goal.currency, locale) })}
          </span>
        ) : null}
      </span>
      <span>
        <StatusPill variant={chipVariant}>{chip}</StatusPill>
      </span>
    </>
  );
}
