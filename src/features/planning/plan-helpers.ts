import type { RepeatRule, RepeatUnit } from '../../domain/model';
import type { Currency } from '../../domain/money';
import { toCadMinor } from '../../domain/money';
import { addDays, monthlyEquivalent, monthsBetween, nextDue } from '../../domain/schedule';
import type { PlanKey } from '../../i18n/plan-de';

// Reine Hilfen für Planung, Formulare und „Sparziel erreicht“ (ohne React/Dexie).

interface Recurring extends RepeatRule {
  amountMinor: number;
  currency: Currency;
}

/** Fälligkeit ab heute (heute zählt mit); `null` bei beendeten oder abgelaufenen Regeln. */
export const nextOccurrence = (rule: RepeatRule, today: string): string | null =>
  nextDue(rule, addDays(today, -1));

/** Läuft die Regel noch oder startet sie erst? (Beendete Regeln zählen nicht mehr zum Monatsbetrag.) */
export const isRunning = (rule: Pick<RepeatRule, 'endsOn'>, today: string): boolean =>
  rule.endsOn == null || rule.endsOn >= today;

/**
 * Summe der Monatsäquivalente in CAD. EUR wird mit dem übergebenen Kurs umgerechnet; ohne Kurs bleibt
 * EUR draußen und `incomplete` ist true (die Summe ist dann ehrlich nur ein Teil).
 */
export function monthlyCadTotal(
  items: readonly Recurring[],
  rateMicro: bigint | null,
  today: string,
): { total: bigint; incomplete: boolean } {
  let total = 0n;
  let incomplete = false;
  for (const it of items) {
    // Aktuelle Monatslast: beendete und noch nicht gestartete Regeln zählen nicht.
    if (!isRunning(it, today) || it.startsOn > today) continue;
    const monthly = monthlyEquivalent(it.amountMinor, it.unit, it.every);
    if (it.currency === 'CAD') total += monthly;
    else if (rateMicro == null) incomplete = true;
    else total += toCadMinor(monthly, rateMicro);
  }
  return { total, incomplete };
}

/** Betrag mit optionalem „-“ für Entnahmen: „-12,50“ → -1250. `null` bei 0 oder ungültig. */
export function parseSignedMinor(text: string, parse: (s: string) => number | null): number | null {
  const trimmed = text.trim();
  const negative = /^[-−]/.test(trimmed);
  const value = parse(negative ? trimmed.slice(1) : trimmed);
  if (!value) return null;
  return negative ? -value : value;
}

export const MAX_EVERY = 99;

/** Echtes Kalenderdatum `YYYY-MM-DD`? */
export function isIsoDay(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y = 0, m = 0, d = 0] = text.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Prüft die Wiederholungsangaben; liefert `every` oder den Fehlerschlüssel. */
export function checkRepeat(input: {
  unit: RepeatUnit;
  everyText: string;
  startsOn: string;
  endsOn: string | null;
}): { every: number; error: PlanKey | null } {
  if (!isIsoDay(input.startsOn)) return { every: 1, error: 'form.error.dates' };
  // Einmalig: Intervall 1, kein Ende (das Formular blendet beides aus).
  if (input.unit === 'once') return { every: 1, error: null };
  const every = Number(input.everyText);
  if (!/^\d+$/.test(input.everyText.trim()) || every < 1 || every > MAX_EVERY) {
    return { every: 1, error: 'form.error.every' };
  }
  if (input.endsOn && input.endsOn < input.startsOn) return { every, error: 'form.error.end' };
  return { every, error: null };
}

/** Pflichtangaben eines Sparziels; erster Fehlerschlüssel oder `null`. */
export function goalError(input: {
  name: string;
  targetMinor: number | null;
  startsOn: string;
  targetDate: string;
}): PlanKey | null {
  if (!input.name.trim()) return 'form.error.name';
  if (!input.targetMinor) return 'form.error.amount';
  if (!input.startsOn || !input.targetDate || input.targetDate <= input.startsOn)
    return 'goal.error.dates';
  return null;
}

/** Dexie-Schlüssel für „Sparziel erreicht schon gezeigt“ (pro Ziel und Person, lokal). */
export const reachedSeenKey = (goalId: string, userId: string): string =>
  `goalReachedSeen:${goalId}:${userId}`;

/** Monate von Start bis heute, mindestens 1 (für „3 Monate von … bis …“). */
export const monthsSpan = (startsOn: string, today: string): number =>
  Math.max(1, monthsBetween(spanFrom(startsOn, today), today));

/** Anfang der Spanne: liegt der Start in der Zukunft, zählt heute. */
export const spanFrom = (startsOn: string, today: string): string =>
  startsOn < today ? startsOn : today;
