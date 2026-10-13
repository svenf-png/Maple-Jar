import type { Locale } from './t';

export type Currency = 'CAD' | 'EUR';

export function formatMoney(minor: bigint | number, currency: Currency, locale: Locale): string {
  const negative = minor < 0;
  const abs = BigInt(minor < 0 ? -minor : minor);
  const whole = abs / 100n;
  const cents = abs % 100n;
  // Ganzzahl-Arithmetik, kein Float: Dezimalstring an Intl übergeben.
  const value = `${negative ? '-' : ''}${whole}.${cents.toString().padStart(2, '0')}`;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    value as `${number}`,
  );
}

/** Kennzeichnet einen umgerechneten Betrag als ungefähr („≈ 12,00 CA$“). */
export const formatApprox = (text: string): string => `≈ ${text}`;

export function formatDate(
  date: Date | string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(d);
}

/** `YYYY-MM-DD` als lokaler Kalendertag formatiert (ohne Zeitzonenverschiebung). */
export function formatDay(
  isoDay: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): string {
  return formatDate(`${isoDay}T00:00:00Z`, locale, options);
}

export function formatMonth(month: string, locale: Locale): string {
  return formatDate(`${month.slice(0, 7)}-01T00:00:00Z`, locale, {
    month: 'long',
    year: 'numeric',
  });
}

/** Kurs aus Mikro-Einheiten (1,61 = 1610000n) als CAD-Betrag, ohne Float-Umweg. */
export function formatRate(micro: bigint, locale: Locale): string {
  const whole = micro / 1_000_000n;
  let frac = (micro % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  frac = frac.padEnd(2, '0');
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(`${whole}.${frac}` as `${number}`);
}
