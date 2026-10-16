import type { Currency } from './money';
import { toCadMinor } from './money';

// Typisierte Sicht auf die materialisierten Zeilen (Dexie). Die Domain bleibt frei von Dexie/React.

export interface Entry {
  id: string;
  amountMinor: number;
  currency: Currency;
  fxRateMicro: number;
  fxRateDate: string;
  fxProvisional: boolean;
  bookedOn: string;
  categoryId: string;
  paidBy: string;
  merchant: string;
  note: string;
  source: 'manual' | 'fixed';
  fixedCostId?: string;
  deleted: boolean;
  conflict: boolean;
  hlc: string;
  createdBy: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort: number;
  hidden: boolean;
  deleted: boolean;
}

export interface Budget {
  id: string;
  categoryId: string;
  /** Monatserster `YYYY-MM-01` */
  validFrom: string;
  monthlyLimitCadMinor: number;
  deleted: boolean;
  hlc: string;
}

export type RepeatUnit = 'once' | 'week' | 'month' | 'year';

/** Wiederholungsregel für Einnahmen und Fixkosten. Bei `once` ist `every` 1 und `endsOn` fehlt. */
export interface RepeatRule {
  unit: RepeatUnit;
  every: number;
  startsOn: string;
  endsOn?: string | null;
}

export interface Income extends RepeatRule {
  id: string;
  name: string;
  memberId?: string | null;
  amountMinor: number;
  currency: Currency;
  deleted: boolean;
  conflict: boolean;
  hlc: string;
}

export interface FixedCost extends RepeatRule {
  id: string;
  name: string;
  amountMinor: number;
  currency: Currency;
  categoryId: string;
  icon?: string | null;
  isSaving: boolean;
  autobook: boolean;
  deleted: boolean;
  conflict: boolean;
  hlc: string;
}

export interface Goal {
  id: string;
  name: string;
  icon: string;
  color: string;
  targetMinor: number;
  currency: Currency;
  startsOn: string;
  targetDate: string;
  archivedAt?: string | null;
  deleted: boolean;
  conflict: boolean;
  hlc: string;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  /** Ganzzahl ≠ 0 in Zielwährung, negativ = Entnahme */
  amountMinor: number;
  contributedOn: string;
  memberId?: string;
  note: string;
  deleted: boolean;
  hlc: string;
}

/** Feste ID der Szenario-Zeile (Einzelzeile, Last-Write-Wins). */
export const SCENARIO_ID = '00000000-0000-4000-8000-00000000005c';

export type ScenarioExtraKind = 'expense' | 'goal';

/** Zusätzlicher Posten: einmalige Ausgabe (`on`) oder Sparziel mit Zieldatum (`targetDate`). */
export interface ScenarioExtra {
  id: string;
  kind: ScenarioExtraKind;
  name: string;
  amountMinor: number;
  currency: Currency;
  on: string;
  targetDate?: string;
}

export interface Scenario {
  id: string;
  /** Regler je Kategorie-ID in Prozent (−50 bis 50, 5er-Schritte). */
  categoryPct: Record<string, number>;
  extras: ScenarioExtra[];
  deleted: boolean;
  hlc: string;
}

type Row = Record<string, unknown>;

export const toEntry = (r: Row): Entry => r as unknown as Entry;
export const toCategory = (r: Row): Category => r as unknown as Category;
export const toBudget = (r: Row): Budget => r as unknown as Budget;
export const toIncome = (r: Row): Income => r as unknown as Income;
export const toFixedCost = (r: Row): FixedCost => r as unknown as FixedCost;
export const toGoal = (r: Row): Goal => r as unknown as Goal;
export const toGoalContribution = (r: Row): GoalContribution => r as unknown as GoalContribution;
export const toScenario = (r: Row): Scenario => r as unknown as Scenario;

/** Betrag in der Basiswährung (CAD-Minor). */
export const entryCad = (e: Pick<Entry, 'amountMinor' | 'fxRateMicro'>): bigint =>
  toCadMinor(e.amountMinor, e.fxRateMicro);

/** `YYYY-MM-01` zu einem Tag `YYYY-MM-DD`. */
export const monthOf = (isoDay: string): string => `${isoDay.slice(0, 7)}-01`;
