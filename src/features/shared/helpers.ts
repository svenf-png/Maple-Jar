import type { HouseholdMember } from '../../data/household';
import { todayIso } from '../../data/today';
import type { Locale } from '../../i18n/t';

export { todayIso };

export const memberName = (members: readonly HouseholdMember[], id: string): string =>
  members.find((m) => m.userId === id)?.displayName ?? '';

/** Dezimalzeichen der Sprache. */
export const decimalSeparator = (locale: Locale): string => (locale === 'de-DE' ? ',' : '.');

/** Betrag als Eingabetext (Komma intern): 8417 → "84,17". */
export const minorToInput = (minor: number): string => {
  const whole = Math.floor(minor / 100);
  const cents = String(minor % 100).padStart(2, '0');
  return cents === '00' ? String(whole) : `${whole},${cents}`;
};

import { formatDay } from '../../i18n/format';
import { t } from '../../i18n/t';

/** „Heute“, „Gestern“ oder Wochentag mit Datum. */
export function dayLabel(isoDay: string, today: string, locale: Locale): string {
  if (isoDay === today) return t('history.today');
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (isoDay === y.toISOString().slice(0, 10)) return t('history.yesterday');
  return formatDay(isoDay, locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Lokaler Kalendertag eines Zeitstempels. */
export const dayOfMs = (ms: number): string => todayIso(new Date(ms));
