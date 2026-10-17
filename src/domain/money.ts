// Beträge sind immer ganze Zahlen in Minor Units (Cent). Kurse sind Mikro-Einheiten (Kurs × 10⁶).
// Kein Float für Geld; Umrechnung mit BigInt.

export type Currency = 'CAD' | 'EUR';

export const MICRO = 1_000_000n;
export const CAD_RATE_MICRO = 1_000_000;

/** Betrag in der Basiswährung: (Betrag × Kurs) / 10⁶, kaufmännisch gerundet (ab .5 weg von null). */
export function toCadMinor(amountMinor: number | bigint, fxRateMicro: number | bigint): bigint {
  const product = BigInt(amountMinor) * BigInt(fxRateMicro);
  const half = MICRO / 2n;
  return product >= 0n ? (product + half) / MICRO : -((-product + half) / MICRO);
}

/** "12,34" oder "12.34" → 1234. Höchstens zwei Nachkommastellen, kein Vorzeichen. Sonst null. */
export function parseDecimalToMinor(input: string): number | null {
  const m = /^(\d{1,12})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const minor = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** 1234 → "12.34" (maschinenlesbar, ohne Locale). Anzeige läuft über `i18n/format.ts`. */
export function minorToDecimal(minor: number | bigint): string {
  const v = BigInt(minor);
  const abs = v < 0n ? -v : v;
  const text = `${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  return v < 0n ? `-${text}` : text;
}

export function sumMinor(values: Iterable<number | bigint>): bigint {
  let total = 0n;
  for (const v of values) total += BigInt(v);
  return total;
}

/** CAD-Minor → EUR-Minor bei Kurs (1 € = rate CA$), kaufmännisch gerundet. */
export function cadToEurMinor(cadMinor: number | bigint, fxRateMicro: number | bigint): bigint {
  const rate = BigInt(fxRateMicro);
  if (rate <= 0n) return 0n;
  return (BigInt(cadMinor) * MICRO + rate / 2n) / rate;
}
