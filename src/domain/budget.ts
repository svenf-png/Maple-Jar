import { type Budget, type Category, type Entry, entryCad, monthOf } from './model';

export type BudgetState = 'none' | 'ok' | 'near' | 'over';

export interface BudgetStatus {
  state: BudgetState;
  /** Ganzzahl-Prozent (abgerundet), nur sinnvoll bei state ≠ none. */
  pct: number;
  /** Überschreitung in CAD-Minor (0 wenn nicht überschritten). */
  overBy: bigint;
}

/** Schwelle für den Hinweis „fast aufgebraucht“. */
export const NEAR_PERCENT = 80;

/** Status: ab 80 % `near`, über dem Limit `over`. Limit 0 bedeutet kein Budget. */
export function budgetStatus(spent: bigint, limit: bigint): BudgetStatus {
  if (limit <= 0n) return { state: 'none', pct: 0, overBy: 0n };
  const pct = Number((spent * 100n) / limit);
  if (spent > limit) return { state: 'over', pct, overBy: spent - limit };
  if (pct >= NEAR_PERCENT) return { state: 'near', pct, overBy: 0n };
  return { state: 'ok', pct, overBy: 0n };
}

/** Gültiges Limit für eine Kategorie in einem Monat: jüngster Eintrag mit validFrom ≤ Monat. */
export function limitFor(
  budgets: readonly Budget[],
  categoryId: string,
  month: string,
): Budget | null {
  let best: Budget | null = null;
  for (const b of budgets) {
    if (b.deleted || b.categoryId !== categoryId || b.validFrom > month) continue;
    if (
      !best ||
      b.validFrom > best.validFrom ||
      (b.validFrom === best.validFrom && b.hlc > best.hlc)
    ) {
      best = b;
    }
  }
  return best;
}

export function spentIn(entries: readonly Entry[], month: string, categoryId?: string): bigint {
  let total = 0n;
  for (const e of entries) {
    if (e.deleted || monthOf(e.bookedOn) !== month) continue;
    if (categoryId !== undefined && e.categoryId !== categoryId) continue;
    total += entryCad(e);
  }
  return total;
}

export interface BudgetRow {
  category: Category;
  spent: bigint;
  limit: bigint;
  status: BudgetStatus;
}

export interface MonthSummary {
  month: string;
  rows: BudgetRow[];
  totalLimit: bigint;
  /** Ausgaben des Monats in Kategorien mit Limit; nur sie zählen gegen das Gesamtbudget. */
  totalSpent: bigint;
  /** Ausgaben des Monats in Kategorien ohne Limit; belasten kein Budget. */
  unbudgetedSpent: bigint;
  remaining: bigint;
  daysLeft: number;
  /** Pro Tag möglich (abgerundet, nie negativ). */
  perDay: bigint;
  state: BudgetState;
  attention: number;
  calm: number;
}

/** Tage vom `today` bis Monatsende, einschließlich `today` (mindestens 1). */
export function daysLeftInMonth(today: string): number {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.max(1, last - d + 1);
}

/**
 * Monatsstand: Gesamtbudget = Summe der Kategorielimits, Ausgaben = nur Ausgaben in Kategorien mit
 * Limit. Ausgaben ohne Limit landen in `unbudgetedSpent` und belasten kein Budget. Der Gesamtstatus
 * ist `over`/`near`, sobald eine budgetierte Kategorie ihr eigenes Limit reißt bzw. fast erreicht.
 * Zeilen nur für sichtbare Kategorien mit Limit, nach Auslastung.
 */
export function monthSummary(input: {
  categories: readonly Category[];
  budgets: readonly Budget[];
  entries: readonly Entry[];
  month: string;
  today: string;
}): MonthSummary {
  const { categories, budgets, entries, month, today } = input;
  const rows: BudgetRow[] = [];
  let totalLimit = 0n;
  let totalSpent = 0n;
  let worst: BudgetState = 'none';
  for (const category of categories) {
    if (category.deleted) continue;
    const b = limitFor(budgets, category.id, month);
    const limit = BigInt(b?.monthlyLimitCadMinor ?? 0);
    if (limit <= 0n) continue;
    totalLimit += limit;
    const spent = spentIn(entries, month, category.id);
    totalSpent += spent;
    const status = budgetStatus(spent, limit);
    if (status.state === 'over' || (status.state === 'near' && worst !== 'over')) {
      worst = status.state;
    } else if (worst === 'none') {
      worst = 'ok';
    }
    if (category.hidden) continue;
    rows.push({ category, spent, limit, status });
  }
  rows.sort((a, b) => b.status.pct - a.status.pct || a.category.sort - b.category.sort);
  const unbudgetedSpent = spentIn(entries, month) - totalSpent;
  const remaining = totalLimit - totalSpent;
  const daysLeft = monthOf(today) === month ? daysLeftInMonth(today) : 1;
  const perDay = remaining > 0n ? remaining / BigInt(daysLeft) : 0n;
  const attention = rows.filter(
    (r) => r.status.state === 'near' || r.status.state === 'over',
  ).length;
  return {
    month,
    rows,
    totalLimit,
    totalSpent,
    unbudgetedSpent,
    remaining,
    daysLeft,
    perDay,
    state: worst,
    attention,
    calm: rows.length - attention,
  };
}
