import { limitFor } from './budget';
import type { KnownRate } from './fx';
import { type Budget, type Category, monthOf, type Scenario } from './model';
import { toCadMinor } from './money';
import {
  type Projection,
  type ProjectionAdjust,
  type ProjectionInput,
  projection,
} from './projection';
import { addMonths, monthsBetween, roundDiv } from './schedule';

// Szenario-Regler (Prognose-Hebel) und Vergleich gegen die Basisprojektion.
// Regler wirken nur auf die Prognose; Extras addieren sich dazu. EUR ohne Kurs zählt 0 und setzt `approximate`.

export const PCT_MIN = -50;
export const PCT_MAX = 50;
export const PCT_STEP = 5;

type ScenarioInput = Pick<Scenario, 'categoryPct' | 'extras'>;

/** Übersetzt Regler und Extras in Projektionsanpassungen. */
export function scenarioAdjust(
  scenario: ScenarioInput,
  today: string,
  rate: KnownRate | null,
): { adjust: ProjectionAdjust; approximate: boolean } {
  const extraVariable = new Map<string, bigint>();
  const extraSaving = new Map<string, bigint>();
  const currentMonth = monthOf(today);
  let approximate = false;
  const add = (map: Map<string, bigint>, month: string, amount: bigint): void => {
    map.set(month, (map.get(month) ?? 0n) + amount);
  };

  for (const extra of scenario.extras) {
    const eur = extra.currency !== 'CAD';
    const amount = BigInt(extra.amountMinor);
    const cad = eur ? (rate ? toCadMinor(amount, rate.rateMicro) : 0n) : amount;

    if (extra.kind === 'expense') {
      // Nur Ausgaben nach heute zählen.
      if (extra.on <= today) continue;
      add(extraVariable, monthOf(extra.on), cad);
      if (eur) approximate = true;
      continue;
    }

    // Sparziel: Gesamtbetrag auf die Monate ab `on` verteilen, Rest auf die ersten Monate.
    const n = BigInt(Math.max(1, monthsBetween(extra.on, extra.targetDate ?? extra.on)));
    const share = cad / n;
    const rest = cad % n;
    const first = monthOf(extra.on);
    let kept = false;
    for (let k = 0n; k < n; k++) {
      const month = addMonths(first, Number(k));
      if (month < currentMonth) continue;
      add(extraSaving, month, share + (k < rest ? 1n : 0n));
      kept = true;
    }
    if (eur && kept) approximate = true;
  }

  return {
    adjust: { categoryPct: scenario.categoryPct, extraVariable, extraSaving },
    approximate,
  };
}

export interface ScenarioComparison {
  base: Projection;
  scenario: Projection;
  /** Szenario minus Basis am Zeitraumende (CAD-Minor). */
  diffEndCadMinor: bigint;
}

/** Basisprojektion und Szenario nebeneinander. */
export function compareScenario(
  input: ProjectionInput,
  scenario: ScenarioInput,
): ScenarioComparison {
  const base = projection(input);
  const { adjust, approximate } = scenarioAdjust(scenario, input.today, input.rate);
  const sc = projection(input, adjust);
  return {
    base,
    scenario: { ...sc, approximate: sc.approximate || approximate },
    diffEndCadMinor: sc.endCadMinor - base.endCadMinor,
  };
}

export interface BudgetProposal {
  categoryId: string;
  fromMinor: bigint;
  toMinor: bigint;
}

/**
 * Budget-Vorschläge ab `month`: Basis ist das gültige Limit, sonst der Mittelwert. Das Ergebnis wird
 * auf ganze Einheiten (Dollar) gerundet.
 */
export function scenarioBudgets(input: {
  categories: readonly Category[];
  budgets: readonly Budget[];
  averages: ReadonlyMap<string, bigint>;
  categoryPct: Readonly<Record<string, number>>;
  month: string;
}): BudgetProposal[] {
  const { categories, budgets, averages, categoryPct, month } = input;
  const out: BudgetProposal[] = [];
  for (const category of [...categories].sort((a, b) => a.sort - b.sort)) {
    if (category.deleted) continue;
    const pct = categoryPct[category.id] ?? 0;
    if (pct === 0) continue;
    const limit = limitFor(budgets, category.id, month)?.monthlyLimitCadMinor ?? 0;
    const base = limit > 0 ? BigInt(limit) : (averages.get(category.id) ?? 0n);
    if (base <= 0n) continue;
    // Prozent (/100) und Minor Units (/100) in einem Schritt; gerundet wird genau einmal, auf ganze Einheiten.
    const toMinor = roundDiv(base * BigInt(100 + pct), 10_000n) * 100n;
    if (toMinor <= 0n) continue;
    out.push({ categoryId: category.id, fromMinor: base, toMinor });
  }
  return out;
}
