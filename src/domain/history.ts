import { normalizeMerchant } from './merchant';
import { type Category, type Entry, entryCad, monthOf } from './model';
import { parseDecimalToMinor } from './money';

export type Period = 'month' | 'last' | 'all';

export type SortKey = 'date' | 'merchant' | 'amount';
export type SortDir = 'asc' | 'desc';

export interface HistoryFilter {
  query: string;
  categoryId: string | null;
  personId: string | null;
  period: Period;
}

/** Monat vor `month` (`YYYY-MM-01`). */
export function previousMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 10);
}

/** Gelöschte Einträge sind nie dabei. Suche über Händler, Notiz, Kategoriename und Betrag. */
export function filterEntries(
  entries: readonly Entry[],
  categories: readonly Category[],
  filter: HistoryFilter,
  today: string,
): Entry[] {
  const q = normalizeMerchant(filter.query);
  const amount = parseDecimalToMinor(filter.query.replace(/[\s€$]|CA/gi, '').replace(/[.,]$/, ''));
  const month = monthOf(today);
  const last = previousMonth(month);
  const names = new Map(categories.map((c) => [c.id, normalizeMerchant(c.name)]));
  return entries.filter((e) => {
    if (e.deleted) return false;
    if (filter.categoryId && e.categoryId !== filter.categoryId) return false;
    if (filter.personId && e.paidBy !== filter.personId) return false;
    const m = monthOf(e.bookedOn);
    if (filter.period === 'month' && m !== month) return false;
    if (filter.period === 'last' && m !== last) return false;
    if (!q) return true;
    const text = `${normalizeMerchant(e.merchant)} ${normalizeMerchant(e.note)} ${names.get(e.categoryId) ?? ''}`;
    if (text.includes(q)) return true;
    return amount !== null && (e.amountMinor === amount || entryCad(e) === BigInt(amount));
  });
}

export interface DayGroup {
  day: string;
  total: bigint;
  entries: Entry[];
}

/** Gruppen nach Buchungstag, neueste zuerst; innerhalb eines Tages neueste zuerst. */
export function groupByDay(entries: readonly Entry[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const e of entries) {
    const g = groups.get(e.bookedOn) ?? { day: e.bookedOn, total: 0n, entries: [] };
    g.total += entryCad(e);
    g.entries.push(e);
    groups.set(e.bookedOn, g);
  }
  const out = [...groups.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
  for (const g of out) g.entries.sort((a, b) => (a.hlc < b.hlc ? 1 : a.hlc > b.hlc ? -1 : 0));
  return out;
}

const cmpText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Sortierte Kopie (Eingabe bleibt unverändert). Schlüssel: Datum, Händler (sonst Notiz) ohne
 * Groß/Klein, Betrag in CAD. Gleichstand: id in Sortierrichtung.
 */
export function sortEntries(
  entries: readonly Entry[],
  key: SortKey,
  dir: SortDir,
  locale: string,
): Entry[] {
  const sign = dir === 'asc' ? 1 : -1;
  const primary = (a: Entry, b: Entry): number => {
    switch (key) {
      case 'date':
        return cmpText(a.bookedOn, b.bookedOn);
      case 'merchant':
        return (a.merchant || a.note).localeCompare(b.merchant || b.note, locale, {
          sensitivity: 'base',
        });
      case 'amount': {
        const x = entryCad(a);
        const y = entryCad(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }
    }
  };
  return [...entries].sort((a, b) => sign * primary(a, b) || sign * cmpText(a.id, b.id));
}
