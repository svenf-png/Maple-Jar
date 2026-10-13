import type { GoalStatus } from '../../domain/goals';
import type { RepeatRule } from '../../domain/model';
import { toCadMinor } from '../../domain/money';
import { daysBetween } from '../../domain/schedule';
import { type Currency, formatDay, formatMoney } from '../../i18n/format';
import type { PlanKey } from '../../i18n/plan-de';
import { type Locale, t } from '../../i18n/t';

/** „Monatlich“, „Alle 2 Wochen“, „Jährlich“, „Einmalig“. Plan-Texte müssen geladen sein. */
export function repeatLabel(rule: Pick<RepeatRule, 'unit' | 'every'>): string {
  if (rule.unit === 'once') return t('plan.repeat.once');
  if (rule.every <= 1) return t(`plan.repeat.${rule.unit}`);
  const key = { week: 'everyWeeks', month: 'everyMonths', year: 'everyYears' } as const;
  return t(`plan.repeat.${key[rule.unit]}`, { n: rule.every });
}

/** „Heute“, „Morgen“, „Übermorgen“, sonst der Tag (auch für Vergangenes). Tage als YYYY-MM-DD. */
export function dueLabel(dueOn: string, today: string, locale: Locale): string {
  const diff = daysBetween(today, dueOn);
  if (diff === 0) return t('due.today');
  if (diff === 1) return t('due.tomorrow');
  if (diff === 2) return t('due.dayAfter');
  return formatDay(dueOn, locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** „≈ 123,00 CA$ / Monat“ */
export function perMonthLabel(cadMinor: bigint | number, locale: Locale): string {
  return t('plan.perMonth', { amount: formatMoney(cadMinor, 'CAD', locale) });
}

export interface GoalStatusView {
  variant: 'ok' | 'warn' | 'neutral';
  key: PlanKey;
}

/** Rückstand und Überfälligkeit sind amber (warn), nie rot. */
export function goalStatusView(status: GoalStatus): GoalStatusView {
  switch (status) {
    case 'behind':
      return { variant: 'warn', key: 'goal.status.behind' };
    case 'overdue':
      return { variant: 'warn', key: 'goal.status.overdue' };
    case 'reached':
      return { variant: 'ok', key: 'goal.status.reached' };
    default:
      return { variant: 'neutral', key: 'goal.status.ok' };
  }
}

export interface AmountView {
  /** Betrag in CAD; `null`, wenn ein EUR-Betrag ohne bekannten Kurs vorliegt. */
  cad: string | null;
  /** Originalbetrag, nur bei EUR. */
  eur?: string;
  /** true, wenn `cad` aus einem Kurs umgerechnet wurde (mit „≈“ kennzeichnen). */
  approximate: boolean;
}

/** Kurs in Mikro-Einheiten (CAD je EUR). Für CAD ist der Kurs egal. */
export function amountWithOriginal(
  minor: number | bigint,
  currency: Currency,
  rateMicro: number | bigint | null | undefined,
  locale: Locale,
): AmountView {
  if (currency === 'CAD') return { cad: formatMoney(minor, 'CAD', locale), approximate: false };
  const eur = formatMoney(minor, 'EUR', locale);
  if (rateMicro == null) return { cad: null, eur, approximate: true };
  return { cad: formatMoney(toCadMinor(minor, rateMicro), 'CAD', locale), eur, approximate: true };
}
