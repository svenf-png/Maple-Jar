import { useEffect, useState } from 'react';
import { coverageByFixedCost, occurrenceIds } from '../domain/fixed-cost';
import type { KnownRate } from '../domain/fx';
import type {
  Budget,
  Category,
  Entry,
  FixedCost,
  Goal,
  GoalContribution,
  Income,
} from '../domain/model';
import type { ProjectionInput } from '../domain/projection';
import {
  useBudgets,
  useCategories,
  useContributions,
  useEntries,
  useFixedCosts,
  useGoals,
  useIncomes,
  useLoaded,
} from './repos';
import { todayIso } from './today';
import { useReadySession } from './use-session';

export interface ProjectionRows {
  incomes: Income[];
  fixedCosts: FixedCost[];
  entries: Entry[];
  contributions: GoalContribution[];
  goals: Goal[];
  budgets: Budget[];
  categories: Category[];
}

/** Baut die Eingaben der Projektion: Zeitraum, heute, Kurs sowie die async berechneten Fälligkeits-IDs. */
export async function buildProjectionInput(
  rows: ProjectionRows,
  period: { periodStart: string; periodEnd: string },
  today: string,
  rate: KnownRate | null,
): Promise<ProjectionInput> {
  const { periodStart, periodEnd } = period;
  const [fixedEntryIds, coveredUntil] = await Promise.all([
    occurrenceIds(rows.fixedCosts, periodStart, periodEnd),
    coverageByFixedCost(
      rows.fixedCosts.filter((f) => !f.deleted),
      rows.entries,
      periodEnd,
    ),
  ]);
  return {
    periodStart,
    periodEnd,
    today,
    incomes: rows.incomes,
    fixedCosts: rows.fixedCosts,
    entries: rows.entries,
    contributions: rows.contributions,
    goals: rows.goals,
    budgets: rows.budgets,
    categories: rows.categories,
    rate,
    fixedEntryIds,
    coveredUntil,
  };
}

/** Projektionseingaben aus Dexie. `null`, bis die asynchronen Fälligkeits-IDs berechnet sind. */
export function useProjectionInput(rate: KnownRate | null): ProjectionInput | null {
  const { household } = useReadySession();
  const { periodStart, periodEnd } = household.settings;
  const today = todayIso();
  const entries = useEntries();
  const incomes = useIncomes();
  const fixedCosts = useFixedCosts();
  const contributions = useContributions();
  const goals = useGoals();
  const budgets = useBudgets();
  const categories = useCategories();
  const loaded = useLoaded();
  const [input, setInput] = useState<ProjectionInput | null>(null);

  useEffect(() => {
    // Vor dem ersten Dexie-Ergebnis nichts bauen: sonst entstünde eine falsche Null-Prognose.
    if (!loaded) return;
    let alive = true;
    buildProjectionInput(
      { incomes, fixedCosts, entries, contributions, goals, budgets, categories },
      { periodStart, periodEnd },
      today,
      rate,
    )
      .then((i) => alive && setInput(i))
      // Fehler nicht unbehandelt lassen; Eingabe bleibt null (keine Daten ausgeben).
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [
    loaded,
    incomes,
    fixedCosts,
    entries,
    contributions,
    goals,
    budgets,
    categories,
    periodStart,
    periodEnd,
    today,
    rate,
  ]);

  return loaded ? input : null;
}
