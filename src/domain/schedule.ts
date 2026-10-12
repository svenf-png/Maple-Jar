import type { RepeatRule, RepeatUnit } from './model';

// Wiederholungen. Alle Daten sind `YYYY-MM-DD`-Strings und werden nur in UTC gerechnet.

const DAY_MS = 86_400_000;

const parse = (day: string): { y: number; m: number; d: number } => ({
  y: Number(day.slice(0, 4)),
  m: Number(day.slice(5, 7)),
  d: Number(day.slice(8, 10)),
});

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

const format = (y: number, m: number, d: number): string =>
  `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;

export const daysInMonth = (y: number, m: number): number =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Tag plus `days` Kalendertage (auch negativ). */
export function addDays(day: string, days: number): string {
  const { y, m, d } = parse(day);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Tag plus `months` Kalendermonate. Der Ausgangstag bleibt `anchorDay` (Standard: Tag von `day`)
 * und fällt in kürzeren Monaten auf den letzten Tag: 31.01. → 28.02. → 31.03. (nicht wandernd).
 */
export function addMonths(day: string, months: number, anchorDay?: number): string {
  const { y, m, d } = parse(day);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return format(ny, nm, Math.min(anchorDay ?? d, daysInMonth(ny, nm)));
}

/** Kalendermonate zwischen zwei Tagen (nur Jahr und Monat zählen, die Tage nicht). Negativ, wenn `to` früher ist. */
export function monthsBetween(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

/** Ganze Tage von `from` bis `to` (negativ, wenn `to` früher ist). */
export function daysBetween(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

/** k-te Fälligkeit (k = 0 ist `startsOn`). Der Ausgangstag ist immer der von `startsOn`. */
function nth(rule: RepeatRule, k: number): string {
  const every = Math.max(1, rule.every);
  switch (rule.unit) {
    case 'once':
      return rule.startsOn;
    case 'week':
      return addDays(rule.startsOn, 7 * every * k);
    case 'month':
      return addMonths(rule.startsOn, every * k, parse(rule.startsOn).d);
    case 'year':
      return addMonths(rule.startsOn, 12 * every * k, parse(rule.startsOn).d);
  }
}

/** Fälligkeiten in aufsteigender Reihenfolge, beginnend bei der ersten ≥ `from`, solange ≤ `limit`. */
function* walk(rule: RepeatRule, from: string, limit: string): Generator<string> {
  const last = rule.endsOn !== undefined && rule.endsOn < limit ? rule.endsOn : limit;
  let k = 0;
  // Grobes Überspringen: nie über `from` hinaus, danach Feinsuche.
  if (rule.unit !== 'once' && from > rule.startsOn) {
    const every = Math.max(1, rule.every);
    const skip =
      rule.unit === 'week'
        ? Math.floor(daysBetween(rule.startsOn, from) / (7 * every))
        : Math.floor(
            monthsBetween(rule.startsOn, from) / (rule.unit === 'year' ? 12 * every : every),
          );
    k = Math.max(0, skip - 1);
  }
  for (; ; k++) {
    const due = nth(rule, k);
    if (due > last) return;
    if (due >= from) yield due;
    if (rule.unit === 'once') return;
  }
}

/** Alle Fälligkeiten im Zeitraum `from`..`to` (beide inklusive), aufsteigend. `once` hat genau eine. */
export function occurrences(rule: RepeatRule, from: string, to: string): string[] {
  const lowest = from > rule.startsOn ? from : rule.startsOn;
  return [...walk(rule, lowest, to)];
}

/** Erste Fälligkeit streng NACH `after` (heute selbst zählt nicht), oder `null`, wenn keine mehr kommt. */
export function nextDue(rule: RepeatRule, after: string): string | null {
  const from = addDays(after, 1);
  const lowest = from > rule.startsOn ? from : rule.startsOn;
  // Obergrenze: spätestens nach dem Ende oder nach einer Wiederholungsperiode plus Reserve.
  const limit =
    rule.endsOn ??
    addMonths(lowest, 12 * Math.max(1, rule.every) + (rule.unit === 'year' ? 12 : 1));
  for (const due of walk(rule, lowest, rule.unit === 'once' ? rule.startsOn : limit)) return due;
  return null;
}

/** Ganzzahl-Division, kaufmännisch gerundet (ab .5 weg von null). Nenner > 0. */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  const abs = numerator < 0n ? -numerator : numerator;
  const q = (2n * abs + denominator) / (2n * denominator);
  return numerator < 0n ? -q : q;
}

/** Betrag pro Monat: Woche ×52/12/every, Monat /every, Jahr /12/every, einmalig 0. */
export function monthlyEquivalent(
  amountMinor: number | bigint,
  unit: RepeatUnit,
  every: number,
): bigint {
  const amount = BigInt(amountMinor);
  const n = BigInt(Math.max(1, every));
  switch (unit) {
    case 'once':
      return 0n;
    case 'week':
      return roundDiv(amount * 52n, 12n * n);
    case 'month':
      return roundDiv(amount, n);
    case 'year':
      return roundDiv(amount, 12n * n);
  }
}
