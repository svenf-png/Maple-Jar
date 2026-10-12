import { CAD_RATE_MICRO, type Currency } from './money';

export interface KnownRate {
  rateMicro: bigint;
  /** Datum, für das der Anbieter den Kurs liefert. */
  date: string;
  /** true: nicht tagesaktuell abrufbar, es ist der zuletzt bekannte Kurs. */
  stale: boolean;
}

export interface RateChoice {
  rateMicro: number;
  rateDate: string;
  provisional: boolean;
}

/**
 * Kursauswahl für einen neuen Eintrag. CAD hat immer Kurs 1. Bei EUR gilt der Tageskurs; ist nur ein
 * älterer bekannter Kurs da (offline), wird er genommen und als Provisorium markiert.
 * `null`, wenn gar kein Kurs bekannt ist.
 */
export function chooseRate(
  currency: Currency,
  bookedOn: string,
  known: KnownRate | null,
): RateChoice | null {
  if (currency === 'CAD')
    return { rateMicro: CAD_RATE_MICRO, rateDate: bookedOn, provisional: false };
  if (!known) return null;
  return { rateMicro: Number(known.rateMicro), rateDate: known.date, provisional: known.stale };
}

/** Nur das Gerät, das den Eintrag erstellt hat, zieht den Tageskurs nach. */
export function needsRateCatchUp(
  entry: { currency: Currency; fxProvisional: boolean; createdByDevice: string },
  deviceId: string,
): boolean {
  return entry.currency !== 'CAD' && entry.fxProvisional && entry.createdByDevice === deviceId;
}
