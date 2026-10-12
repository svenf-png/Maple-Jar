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

type Row = Record<string, unknown>;

export const toEntry = (r: Row): Entry => r as unknown as Entry;
export const toCategory = (r: Row): Category => r as unknown as Category;
export const toBudget = (r: Row): Budget => r as unknown as Budget;

/** Betrag in der Basiswährung (CAD-Minor). */
export const entryCad = (e: Pick<Entry, 'amountMinor' | 'fxRateMicro'>): bigint =>
  toCadMinor(e.amountMinor, e.fxRateMicro);

/** `YYYY-MM-01` zu einem Tag `YYYY-MM-DD`. */
export const monthOf = (isoDay: string): string => `${isoDay.slice(0, 7)}-01`;
