import { limitFor } from './budget';
import { type OccurrenceIds, occurrenceKey } from './fixed-cost';
import type { KnownRate } from './fx';
import {
  type Budget,
  type Category,
  type Entry,
  entryCad,
  type FixedCost,
  type Goal,
  type GoalContribution,
  type Income,
  monthOf,
} from './model';
import { type Currency, toCadMinor } from './money';
import { addDays, addMonths, daysBetween, daysInMonth, occurrences, roundDiv } from './schedule';

// Monatliche Cash-Flow-Projektion bis zum Ende des Haushaltszeitraums.
// - Monate: jeder Kalendermonat von periodStart bis monthOf(periodEnd); kind: vor/in/nach heute.
// - Ist-Teil je Monat: alle Daten im Monat UND im Zeitraum (auch nach heute).
//   Eine Fixkosten-Fälligkeit zählt genau einmal (wie income-split): Eintrag vorhanden und nicht gelöscht
//   → zählt der Eintrag; sonst die Fälligkeit, außer sie ist durch einen verwaisten Eintrag abgedeckt.
// - Prognose-Teil: nur Tage nach heute; je Kategorie Mittelwert × Regler × Tage / Tage im Monat.
// - EUR ohne Kurs zählt 0. Jede EUR-Umrechnung oder ein fehlender Kurs setzt `approximate`.

export interface ProjectionInput {
  /** YYYY-MM-01 */
  periodStart: string;
  /** YYYY-MM-DD, >= periodStart */
  periodEnd: string;
  today: string;
  incomes: readonly Income[];
  fixedCosts: readonly FixedCost[];
  entries: readonly Entry[];
  contributions: readonly GoalContribution[];
  goals: readonly Goal[];
  budgets: readonly Budget[];
  categories: readonly Category[];
  rate: KnownRate | null;
  /** occurrenceIds(fixedCosts, periodStart, periodEnd) */
  fixedEntryIds: OccurrenceIds;
  /** coverageByFixedCost(fixedCosts, entries, periodEnd) */
  coveredUntil: ReadonlyMap<string, string>;
}

export interface ProjectionAdjust {
  /** Kategorie-ID → Prozent (−50..50), wirkt nur auf die variable Prognose. */
  categoryPct: Readonly<Record<string, number>>;
  /** Monatserster → zusätzliche variable Ausgaben bzw. zusätzliches Sparen (CAD-Minor). */
  extraVariable: ReadonlyMap<string, bigint>;
  extraSaving: ReadonlyMap<string, bigint>;
}

export type MonthKind = 'actual' | 'current' | 'forecast';
export type VariableBasis = 'average' | 'budget' | 'none';

export interface ProjectionMonth {
  month: string;
  kind: MonthKind;
  incomeCadMinor: bigint;
  fixedCadMinor: bigint;
  savingCadMinor: bigint;
  variableCadMinor: bigint;
  /** income − fixed − saving − variable */
  netCadMinor: bigint;
  cumulativeCadMinor: bigint;
}

export interface VariableAverages {
  basis: VariableBasis;
  byCategory: Map<string, bigint>;
}

export interface Projection {
  months: ProjectionMonth[];
  /** cumulative des letzten Monats, 0 ohne Monate */
  endCadMinor: bigint;
  variableBasis: VariableBasis;
  variableByCategory: Map<string, bigint>;
  approximate: boolean;
}

/** Letzter Tag des Monats `YYYY-MM-01`. */
const monthEnd = (month: string): string => addDays(addMonths(month, 1), -1);

/** Alle Monatsersten von `periodStart` bis zum Monat von `periodEnd`. */
function monthList(periodStart: string, periodEnd: string): string[] {
  const out: string[] = [];
  const last = monthOf(periodEnd);
  for (let m = monthOf(periodStart); m <= last; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Tage des Monats, die im Zeitraum liegen (inklusive Ränder). */
function windowOf(
  month: string,
  periodStart: string,
  periodEnd: string,
): { from: string; to: string } {
  const end = monthEnd(month);
  return {
    from: month > periodStart ? month : periodStart,
    to: end < periodEnd ? end : periodEnd,
  };
}

/**
 * Mittelwerte für die variable Prognose. Basis: die drei Monate vor heute, soweit ≥ Monat des frühesten
 * nicht gelöschten manuellen Eintrags. Ohne solche Monate: Budget-Limits je Kategorie, sonst `none`.
 */
export function variableAverages(
  input: Pick<ProjectionInput, 'entries' | 'budgets' | 'categories' | 'today'>,
): VariableAverages {
  const { entries, budgets, categories, today } = input;
  const current = monthOf(today);
  const manual = entries.filter((e) => !e.deleted && e.source === 'manual');

  let earliest: string | null = null;
  for (const e of manual) {
    const m = monthOf(e.bookedOn);
    if (earliest === null || m < earliest) earliest = m;
  }
  const candidates = new Set<string>();
  if (earliest !== null) {
    for (const back of [3, 2, 1]) {
      const m = addMonths(current, -back);
      if (m >= earliest) candidates.add(m);
    }
  }

  if (candidates.size > 0) {
    const sums = new Map<string, bigint>();
    for (const e of manual) {
      if (!candidates.has(monthOf(e.bookedOn))) continue;
      sums.set(e.categoryId, (sums.get(e.categoryId) ?? 0n) + entryCad(e));
    }
    const n = BigInt(candidates.size);
    const byCategory = new Map<string, bigint>();
    for (const [id, sum] of sums) {
      if (sum !== 0n) byCategory.set(id, roundDiv(sum, n));
    }
    return { basis: 'average', byCategory };
  }

  const byCategory = new Map<string, bigint>();
  for (const c of categories) {
    if (c.deleted) continue;
    const limit = BigInt(limitFor(budgets, c.id, current)?.monthlyLimitCadMinor ?? 0);
    if (limit > 0n) byCategory.set(c.id, limit);
  }
  return { basis: byCategory.size > 0 ? 'budget' : 'none', byCategory };
}

/** Monatliche Projektion aus Ist und Prognose. `adjust` wirkt nur auf die Prognose bzw. addiert Extras. */
export function projection(input: ProjectionInput, adjust?: ProjectionAdjust): Projection {
  const { periodStart, periodEnd, today, rate, incomes, fixedCosts, entries, contributions } =
    input;
  const { goals, fixedEntryIds, coveredUntil } = input;
  const averages = variableAverages(input);
  const currentMonth = monthOf(today);
  const fixedById = new Map(fixedCosts.map((f) => [f.id, f]));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const goalCurrency = new Map(goals.map((g) => [g.id, g.currency]));
  const tomorrow = addDays(today, 1);

  let approximate = false;
  const convert = (amount: number, currency: Currency): bigint => {
    if (currency === 'CAD') return BigInt(amount);
    approximate = true;
    return rate ? toCadMinor(amount, rate.rateMicro) : 0n;
  };

  const months: ProjectionMonth[] = [];
  let cumulative = 0n;
  for (const month of monthList(periodStart, periodEnd)) {
    const { from, to } = windowOf(month, periodStart, periodEnd);
    const kind: MonthKind =
      month < currentMonth ? 'actual' : month === currentMonth ? 'current' : 'forecast';
    let income = 0n;
    let fixed = 0n;
    let saving = 0n;
    let variable = 0n;

    // Ist: Einnahmen
    for (const inc of incomes) {
      if (inc.deleted) continue;
      const n = occurrences(inc, from, to).length;
      if (n > 0) income += BigInt(n) * convert(inc.amountMinor, inc.currency);
    }

    // Ist: gebuchte Einträge
    for (const e of entries) {
      if (e.deleted || e.bookedOn < from || e.bookedOn > to) continue;
      const cad = entryCad(e);
      if (e.source === 'manual') {
        variable += cad;
        continue;
      }
      const fc = e.fixedCostId ? fixedById.get(e.fixedCostId) : undefined;
      if (fc?.isSaving) saving += cad;
      else fixed += cad;
    }

    // Ist: ungebuchte Fixkosten-Fälligkeiten (nur, wenn nicht schon als Eintrag oder verwaist abgedeckt)
    for (const fc of fixedCosts) {
      if (fc.deleted) continue;
      for (const dueOn of occurrences(fc, from, to)) {
        if (dueOn <= (coveredUntil.get(fc.id) ?? '')) continue;
        const id = fixedEntryIds.get(occurrenceKey(fc.id, dueOn));
        if (id !== undefined && entryById.get(id)?.deleted === false) continue;
        const cad = convert(fc.amountMinor, fc.currency);
        if (fc.isSaving) saving += cad;
        else fixed += cad;
      }
    }

    // Ist: Sparbeiträge (Entnahmen zählen nicht)
    for (const c of contributions) {
      if (c.deleted || c.amountMinor <= 0 || c.contributedOn < from || c.contributedOn > to)
        continue;
      saving += convert(c.amountMinor, goalCurrency.get(c.goalId) ?? 'CAD');
    }

    // Prognose: nur Tage nach heute im Zeitraum
    const forecastFrom = tomorrow > from ? tomorrow : from;
    const days = forecastFrom <= to ? daysBetween(forecastFrom, to) + 1 : 0;
    if (days > 0) {
      const dim = BigInt(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7))));
      for (const [categoryId, avg] of averages.byCategory) {
        const pct = adjust?.categoryPct[categoryId] ?? 0;
        variable += roundDiv(avg * BigInt(100 + pct) * BigInt(days), 100n * dim);
      }
    }

    variable += adjust?.extraVariable.get(month) ?? 0n;
    saving += adjust?.extraSaving.get(month) ?? 0n;

    const net = income - fixed - saving - variable;
    cumulative += net;
    months.push({
      month,
      kind,
      incomeCadMinor: income,
      fixedCadMinor: fixed,
      savingCadMinor: saving,
      variableCadMinor: variable,
      netCadMinor: net,
      cumulativeCadMinor: cumulative,
    });
  }

  return {
    months,
    endCadMinor: months.at(-1)?.cumulativeCadMinor ?? 0n,
    variableBasis: averages.basis,
    variableByCategory: averages.byCategory,
    approximate,
  };
}
