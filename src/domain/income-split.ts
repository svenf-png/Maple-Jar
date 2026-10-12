import { limitFor } from './budget';
import { type OccurrenceIds, occurrenceKey } from './fixed-cost';
import type { KnownRate } from './fx';
import {
  type Budget,
  type Entry,
  entryCad,
  type FixedCost,
  type Goal,
  type GoalContribution,
  type Income,
  monthOf,
} from './model';
import { toCadMinor } from './money';
import { occurrences } from './schedule';

export type SplitKind = 'fixed' | 'budget' | 'other' | 'saving' | 'free' | 'overflow';
export type SplitMode = 'normal' | 'noIncome' | 'overflow';

export interface SplitSegment {
  kind: SplitKind;
  cadMinor: bigint;
  /** Ganzzahl; alle Segmente zusammen genau 100 (wenn totalCadMinor > 0). */
  percent: number;
}

export interface IncomeSplit {
  /** Ganzer Kreis in CAD-Minor. */
  totalCadMinor: bigint;
  /** Echte Einnahmen und Ausgaben (vor Skalierung im Modus overflow). */
  incomeCadMinor: bigint;
  expensesCadMinor: bigint;
  /** true: mindestens ein EUR-Betrag wurde mit dem bekannten Kurs umgerechnet (Anzeige „≈“). */
  approximate: boolean;
  mode: SplitMode;
  segments: SplitSegment[];
}

export interface IncomeSplitInput {
  incomes: readonly Income[];
  fixedCosts: readonly FixedCost[];
  entries: readonly Entry[];
  contributions: readonly GoalContribution[];
  goals: readonly Goal[];
  budgets: readonly Budget[];
  today: string;
  rate: KnownRate | null;
  /** Vorberechnete Eintrags-IDs der Fälligkeiten (`occurrenceIds` aus fixed-cost.ts) für den Monat bis heute. */
  fixedEntryIds: OccurrenceIds;
}

/** Prozente nach dem Verfahren des größten Rests, Summe exakt 100 (Gleichstand: frühere Segmente zuerst). */
export function percentsOf(values: readonly bigint[]): number[] {
  const total = values.reduce((a, b) => a + b, 0n);
  if (total <= 0n) return values.map(() => 0);
  const base = values.map((v) => (v * 100n) / total);
  const rest = values.map((v, i) => ({ i, r: (v * 100n) % total }));
  let missing = 100 - base.reduce((a, b) => a + Number(b), 0);
  rest.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const out = base.map(Number);
  for (const { i } of rest) {
    if (missing <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    missing--;
  }
  return out;
}

/**
 * Anteil am Einkommen, Monat bis heute. Annahmen:
 * - Einnahmen/Fixkosten-Fälligkeiten in EUR werden mit `rate` umgerechnet; ohne Kurs entfallen sie.
 * - Eine Fälligkeit zählt genau einmal: ist ihr Eintrag (ID) vorhanden und nicht gelöscht, zählt der Eintrag
 *   (mit seinem eigenen Kurs, wenn sein Datum im Monat liegt); ist er gelöscht, zählt nichts; sonst die Fälligkeit.
 * - Beiträge zählen, wenn positiv und im Monat bis heute (auch zu archivierten Zielen); unbekanntes Ziel = CAD.
 */
export function incomeSplit(input: IncomeSplitInput): IncomeSplit {
  const { today, rate } = input;
  const month = monthOf(today);
  let approximate = false;

  const convert = (amount: number, currency: 'CAD' | 'EUR'): bigint => {
    if (currency === 'CAD') return BigInt(amount);
    if (!rate) return 0n;
    approximate = true;
    return toCadMinor(amount, rate.rateMicro);
  };

  let income = 0n;
  for (const inc of input.incomes) {
    if (inc.deleted) continue;
    income +=
      BigInt(occurrences(inc, month, today).length) * convert(inc.amountMinor, inc.currency);
  }

  const fixedById = new Map(input.fixedCosts.map((f) => [f.id, f]));
  const entryById = new Map(input.entries.map((e) => [e.id, e]));
  let fixed = 0n;
  let budget = 0n;
  let other = 0n;
  let saving = 0n;

  for (const e of input.entries) {
    if (e.deleted || e.bookedOn < month || e.bookedOn > today) continue;
    const cad = entryCad(e);
    if (e.source === 'fixed') {
      const fc = e.fixedCostId ? fixedById.get(e.fixedCostId) : undefined;
      if (fc?.isSaving) saving += cad;
      else fixed += cad;
    } else if ((limitFor(input.budgets, e.categoryId, month)?.monthlyLimitCadMinor ?? 0) > 0) {
      budget += cad;
    } else {
      other += cad;
    }
  }

  for (const fc of input.fixedCosts) {
    if (fc.deleted) continue;
    for (const dueOn of occurrences(fc, month, today)) {
      const id = input.fixedEntryIds.get(occurrenceKey(fc.id, dueOn));
      if (id !== undefined && entryById.has(id)) continue; // gebucht (zählt als Eintrag) oder gelöscht
      const cad = convert(fc.amountMinor, fc.currency);
      if (fc.isSaving) saving += cad;
      else fixed += cad;
    }
  }

  const goalCurrency = new Map(input.goals.map((g) => [g.id, g.currency]));
  for (const c of input.contributions) {
    if (c.deleted || c.amountMinor <= 0 || c.contributedOn < month || c.contributedOn > today)
      continue;
    saving += convert(c.amountMinor, goalCurrency.get(c.goalId) ?? 'CAD');
  }

  const expenses = fixed + budget + other + saving;
  const parts: Array<[SplitKind, bigint]> = [
    ['fixed', fixed],
    ['budget', budget],
    ['other', other],
    ['saving', saving],
  ];
  let mode: SplitMode = 'normal';
  let total = income;

  if (income <= 0n) {
    mode = 'noIncome';
    total = expenses;
  } else if (expenses > income) {
    // Kreis = Ausgaben. Der durch Einnahmen gedeckte Teil wird anteilig auf die Kategorien verteilt,
    // der Rest ist der Überlauf.
    mode = 'overflow';
    total = expenses;
    const covered = percentsLike(
      parts.map(([, v]) => v),
      income,
    );
    parts.forEach((p, i) => {
      p[1] = covered[i] ?? 0n;
    });
    parts.push(['overflow', expenses - income]);
  } else {
    parts.push(['free', income - expenses]);
  }

  const percents = percentsOf(parts.map(([, v]) => v));
  return {
    totalCadMinor: total,
    incomeCadMinor: income,
    expensesCadMinor: expenses,
    approximate,
    mode,
    segments: parts.map(([kind, cadMinor], i) => ({ kind, cadMinor, percent: percents[i] ?? 0 })),
  };
}

/** Verteilt `sum` im Verhältnis von `values` auf ganze Beträge, Summe exakt `sum` (größter Rest). */
function percentsLike(values: readonly bigint[], sum: bigint): bigint[] {
  const total = values.reduce((a, b) => a + b, 0n);
  if (total <= 0n) return values.map(() => 0n);
  const base = values.map((v) => (v * sum) / total);
  let missing = sum - base.reduce((a, b) => a + b, 0n);
  const order = values
    .map((v, i) => ({ i, r: (v * sum) % total }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (missing <= 0n) break;
    base[i] = (base[i] ?? 0n) + 1n;
    missing--;
  }
  return base;
}
