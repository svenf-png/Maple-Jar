import { formatMoney } from '../../i18n/format';
import type { Locale } from '../../i18n/t';

/** Betrag mit Vorzeichen: „+“ bzw. „−“ (U+2212) vor `formatMoney` des Absolutwerts. Null ohne Vorzeichen. */
export function signedMoney(minor: bigint, locale: Locale): string {
  const money = formatMoney(minor < 0n ? -minor : minor, 'CAD', locale);
  if (minor > 0n) return `+${money}`;
  if (minor < 0n) return `−${money}`;
  return money;
}
