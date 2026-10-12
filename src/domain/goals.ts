import type { Goal, GoalContribution } from './model';
import { addMonths, daysBetween, monthsBetween, roundDiv } from './schedule';

export type GoalStatus = 'ok' | 'behind' | 'reached' | 'overdue';

/** Stand in Zielwährung: Summe der nicht gelöschten Beiträge (Entnahmen sind negativ). */
export function saved(contributions: readonly GoalContribution[]): bigint {
  let total = 0n;
  for (const c of contributions) if (!c.deleted) total += BigInt(c.amountMinor);
  return total;
}

/** Stand je Ziel. */
export function savedByGoal(contributions: readonly GoalContribution[]): Map<string, bigint> {
  const map = new Map<string, bigint>();
  for (const c of contributions) {
    if (c.deleted) continue;
    map.set(c.goalId, (map.get(c.goalId) ?? 0n) + BigInt(c.amountMinor));
  }
  return map;
}

/** Ziele, die in Auswertungen mitzählen: weder gelöscht noch archiviert. */
export const activeGoals = (goals: readonly Goal[]): Goal[] =>
  goals.filter((g) => !g.deleted && g.archivedAt === undefined);

/** Fortschritt in ganzen Prozent, abgerundet, zwischen 0 und 100. */
export function progress(goal: Pick<Goal, 'targetMinor'>, savedMinor: bigint): number {
  const target = BigInt(goal.targetMinor);
  if (target <= 0n || savedMinor <= 0n) return 0;
  if (savedMinor >= target) return 100;
  return Number((savedMinor * 100n) / target);
}

export const isReached = (goal: Pick<Goal, 'targetMinor'>, savedMinor: bigint): boolean =>
  savedMinor >= BigInt(goal.targetMinor);

/**
 * Verbleibende Monate bis zum Zieldatum: Kalendermonat-Differenz (Jahr und Monat, ohne Tage),
 * mindestens 1. Heute 10.02., Ziel 30.06. → 4. Im Zielmonat oder danach → 1.
 */
export function remainingMonths(today: string, targetDate: string): number {
  return Math.max(1, monthsBetween(today, targetDate));
}

/** Rest geteilt durch verbleibende Monate, aufgerundet; 0 wenn erreicht. Zugleich der Vorschlagsbetrag. */
export function requiredMonthly(
  goal: Pick<Goal, 'targetMinor' | 'targetDate'>,
  savedMinor: bigint,
  today: string,
): bigint {
  const remaining = BigInt(goal.targetMinor) - savedMinor;
  if (remaining <= 0n) return 0n;
  const months = BigInt(remainingMonths(today, goal.targetDate));
  return (remaining + months - 1n) / months;
}

export const suggestedContribution = requiredMonthly;

export interface PlanDeviation {
  status: GoalStatus;
  /** Soll-Stand heute nach linearem Plan (nach Tagen von startsOn bis targetDate). */
  plannedMinor: bigint;
  /** Rückstand auf den Plan, nie negativ. */
  behindMinor: bigint;
  /** Betrag, der noch fehlt, um beim Soll-Stand in einem Monat (heute + 1 Monat, höchstens targetDate) im Plan zu sein. */
  backOnPlanMinor: bigint;
  /** Monatserster (`YYYY-MM-01`) des Monats, auf den sich backOnPlanMinor bezieht. */
  backOnPlanMonth: string;
}

function plannedAt(
  goal: Pick<Goal, 'targetMinor' | 'startsOn' | 'targetDate'>,
  day: string,
): bigint {
  const total = daysBetween(goal.startsOn, goal.targetDate);
  if (total <= 0) return BigInt(goal.targetMinor);
  const elapsed = Math.min(total, Math.max(0, daysBetween(goal.startsOn, day)));
  return roundDiv(BigInt(goal.targetMinor) * BigInt(elapsed), BigInt(total));
}

/**
 * Plan-Abweichung. Status: `reached` (Stand ≥ Ziel) vor `overdue` (Zieldatum vorbei, nicht erreicht)
 * vor `behind` (Rückstand > 0) vor `ok`.
 */
export function planDeviation(
  goal: Pick<Goal, 'targetMinor' | 'startsOn' | 'targetDate'>,
  savedMinor: bigint,
  today: string,
): PlanDeviation {
  const planned = plannedAt(goal, today);
  const behind = planned > savedMinor ? planned - savedMinor : 0n;
  const nextMonthDay = addMonths(today, 1);
  const horizon = nextMonthDay < goal.targetDate ? nextMonthDay : goal.targetDate;
  const needed = plannedAt(goal, horizon) - savedMinor;
  let status: GoalStatus = 'ok';
  if (isReached(goal, savedMinor)) status = 'reached';
  else if (today > goal.targetDate) status = 'overdue';
  else if (behind > 0n) status = 'behind';
  return {
    status,
    plannedMinor: planned,
    behindMinor: behind,
    backOnPlanMinor: needed > 0n ? needed : 0n,
    backOnPlanMonth: `${horizon.slice(0, 7)}-01`,
  };
}
