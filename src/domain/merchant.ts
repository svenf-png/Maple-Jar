import type { Entry } from './model';

/** Vergleichsform: klein, ohne Akzente und Satzzeichen, Leerraum zusammengezogen. */
export function normalizeMerchant(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export interface MerchantSuggestion {
  /** Zuletzt verwendete Schreibweise. */
  merchant: string;
  categoryId: string;
  /** Anzahl früherer Einträge bei diesem Händler. */
  count: number;
}

function collect(
  entries: readonly Entry[],
): Map<string, MerchantSuggestion & { last: string; cats: Map<string, number> }> {
  const groups = new Map<
    string,
    MerchantSuggestion & { last: string; cats: Map<string, number> }
  >();
  for (const e of entries) {
    if (e.deleted) continue;
    const key = normalizeMerchant(e.merchant);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = { merchant: e.merchant, categoryId: e.categoryId, count: 0, last: '', cats: new Map() };
      groups.set(key, g);
    }
    g.count++;
    g.cats.set(e.categoryId, (g.cats.get(e.categoryId) ?? 0) + 1);
    if (e.bookedOn + e.hlc >= g.last) {
      g.last = e.bookedOn + e.hlc;
      g.merchant = e.merchant;
    }
  }
  for (const g of groups.values()) {
    // häufigste Kategorie, bei Gleichstand die zuerst gefundene (stabil)
    let best = g.categoryId;
    let bestCount = -1;
    for (const [id, n] of g.cats) {
      if (n > bestCount) {
        best = id;
        bestCount = n;
      }
    }
    g.categoryId = best;
  }
  return groups;
}

/** Vorschläge zu einer Eingabe: Händler, deren Name (oder ein Wort davon) mit der Eingabe beginnt. */
export function suggestMerchants(
  entries: readonly Entry[],
  query: string,
  limit = 5,
): MerchantSuggestion[] {
  const q = normalizeMerchant(query);
  if (!q) return [];
  const out: Array<MerchantSuggestion & { last: string }> = [];
  for (const [key, g] of collect(entries)) {
    const match = key.startsWith(q) || key.split(' ').some((w) => w.startsWith(q));
    if (match) out.push(g);
  }
  out.sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
  return out
    .slice(0, limit)
    .map(({ merchant, categoryId, count }) => ({ merchant, categoryId, count }));
}

/** Kategorie-Vorschlag für genau diesen Händler („Vorschlag aus N früheren Einkäufen“). */
export function suggestCategory(
  entries: readonly Entry[],
  merchant: string,
): { categoryId: string; count: number } | null {
  const key = normalizeMerchant(merchant);
  if (!key) return null;
  const g = collect(entries).get(key);
  return g ? { categoryId: g.categoryId, count: g.count } : null;
}
