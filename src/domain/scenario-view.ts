import { limitFor } from './budget';
import {
  type Budget,
  type Category,
  monthOf,
  type Scenario,
  type ScenarioExtra,
  type ScenarioExtraKind,
} from './model';
import type { Currency } from './money';
import { addMonths, monthsBetween, roundDiv } from './schedule';

// Reine Hilfen für die Szenario-Ansicht (Regler und zusätzliche Posten).

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const NAME_MAX = 80;

/** Sichtbare, nicht gelöschte Kategorien mit Mittelwert oder Budget im Monat, nach `sort`. */
export function sliderCategories(
  categories: readonly Category[],
  budgets: readonly Budget[],
  averages: ReadonlyMap<string, bigint>,
  month: string,
): Category[] {
  return categories
    .filter((c) => {
      if (c.deleted || c.hidden) return false;
      const avg = averages.get(c.id) ?? 0n;
      const limit = limitFor(budgets, c.id, month)?.monthlyLimitCadMinor ?? 0;
      return avg > 0n || limit > 0;
    })
    .sort((a, b) => a.sort - b.sort);
}

/** Mittelwert × (100 + Prozent) / 100, kaufmännisch gerundet. */
export function adjustedMonthly(avg: bigint, pct: number): bigint {
  return roundDiv(avg * BigInt(100 + pct), 100n);
}

/** Monatserster des Monats nach `today` (`YYYY-MM-DD`). */
export function nextMonth(today: string): string {
  return addMonths(monthOf(today), 1);
}

/** Aktiv, wenn ein Regler ungleich 0 ist oder ein zusätzlicher Posten existiert. */
export function isScenarioActive(s: Pick<Scenario, 'categoryPct' | 'extras'> | null): boolean {
  if (!s) return false;
  return Object.values(s.categoryPct).some((v) => v !== 0) || s.extras.length > 0;
}

/**
 * Liegt der Posten außerhalb des Zeitraums bzw. vor heute?
 * Ausgabe: nicht zählend, wenn am heutigen Tag oder davor, bzw. außerhalb des Zeitraums.
 * Ziel: außerhalb, wenn alle seine Monate vor dem laufenden Monat oder nach dem Zeitraum liegen.
 */
export function extraOutsidePeriod(
  extra: ScenarioExtra,
  periodStart: string,
  periodEnd: string,
  today: string,
): boolean {
  if (extra.kind === 'expense') {
    return extra.on <= today || extra.on < periodStart || extra.on > periodEnd;
  }
  const first = monthOf(extra.on);
  const target = extra.targetDate ?? extra.on;
  const last = addMonths(first, Math.max(1, monthsBetween(extra.on, target)) - 1);
  return last < monthOf(today) || first > monthOf(periodEnd);
}

export interface ExtraDraft {
  kind: ScenarioExtraKind;
  name: string;
  amountMinor: number | null;
  currency: Currency;
  on: string;
  targetDate: string;
}

export type ExtraError = 'name' | 'amount' | 'on' | 'targetDate';

/** Erster Fehler des Entwurfs oder null. Reihenfolge: Name, Betrag, Datum, Zieldatum. */
export function validateExtra(d: ExtraDraft): ExtraError | null {
  const name = d.name.trim();
  if (name.length < 1 || [...name].length > NAME_MAX) return 'name';
  if (d.amountMinor === null || !Number.isInteger(d.amountMinor) || d.amountMinor <= 0) {
    return 'amount';
  }
  if (!ISO_DAY.test(d.on)) return 'on';
  if (d.kind === 'goal') {
    if (!ISO_DAY.test(d.targetDate) || d.targetDate <= d.on) return 'targetDate';
  }
  return null;
}

/** Baut den Posten aus einem geprüften Entwurf (vorher `validateExtra` aufrufen). */
export function toExtra(d: ExtraDraft, id: string): ScenarioExtra {
  const base = {
    id,
    kind: d.kind,
    name: d.name.trim(),
    amountMinor: d.amountMinor ?? 0,
    currency: d.currency,
    on: d.on,
  };
  return d.kind === 'goal' ? { ...base, targetDate: d.targetDate } : base;
}
