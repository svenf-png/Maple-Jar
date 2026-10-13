import { db } from '../db';
import { todayIso } from '../today';

export type FxProvider = 'ECB' | 'BOC';

export interface FxRate {
  /** Kurs × 10⁶ (1,61 = 1610000n) */
  rateMicro: bigint;
  /** Datum, für das der Anbieter den Kurs liefert (kann vor dem angefragten liegen). */
  date: string;
  provider: FxProvider;
  /** true, wenn nicht aktuell abrufbar und der letzte bekannte Kurs genommen wurde. */
  stale: boolean;
}

/** Parst einen Dezimalstring ohne Float in Mikro-Einheiten (Rundung kaufmännisch ab 7. Stelle). */
export function parseRateMicro(value: string | number): bigint {
  const s = typeof value === 'number' ? String(value) : value.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error('Invalid rate');
  const whole = BigInt(m[1] ?? '0');
  const frac = (m[2] ?? '').padEnd(7, '0');
  let micro = whole * 1_000_000n + BigInt(frac.slice(0, 6));
  if (Number(frac[6]) >= 5) micro += 1n;
  return micro;
}

const cacheKey = (date: string, provider: FxProvider) => `fx:${provider}:${date}`;
const lastKey = (provider: FxProvider) => `fx:last:${provider}`;

interface Stored {
  rateMicro: string;
  date: string;
}

export async function fetchRate(date: string, provider: FxProvider): Promise<FxRate> {
  const cached = (await db.meta.get(cacheKey(date, provider)))?.value as Stored | undefined;
  if (cached) {
    return { rateMicro: BigInt(cached.rateMicro), date: cached.date, provider, stale: false };
  }
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v2/rate/EUR/CAD?date=${encodeURIComponent(date)}&providers=${provider}`,
    );
    if (!res.ok) throw new Error('Rate request failed');
    // Antwortformat laut Auftrag: { date, base, quote, rate }
    const json = (await res.json()) as { date?: unknown; rate?: unknown };
    if (
      typeof json.date !== 'string' ||
      (typeof json.rate !== 'number' && typeof json.rate !== 'string')
    ) {
      throw new Error('Unexpected rate response');
    }
    // Zahl aus JSON.parse ist bereits Float; String-Darstellung genügt bei ≤ 6 Nachkommastellen.
    const rateMicro = parseRateMicro(json.rate);
    const stored: Stored = { rateMicro: rateMicro.toString(), date: json.date };
    // Für heute oder die Zukunft ist eine Antwort mit früherem Datum nur ein Notbehelf (Tageskurs noch nicht
    // veröffentlicht): nicht unter dem erfragten Tag zwischenspeichern, damit der Nachzug den echten Kurs holt.
    const interim = date >= todayIso() && json.date < date;
    // Parallele Abrufe: der zuletzt bekannte Kurs wird nur durch einen neueren ersetzt.
    const last = (await db.meta.get(lastKey(provider)))?.value as Stored | undefined;
    const newer = !last || json.date >= last.date;
    await db.meta.bulkPut([
      ...(interim ? [] : [{ key: cacheKey(date, provider), value: stored }]),
      ...(newer ? [{ key: lastKey(provider), value: stored }] : []),
    ]);
    return { rateMicro, date: json.date, provider, stale: false };
  } catch (err) {
    const last = (await db.meta.get(lastKey(provider)))?.value as Stored | undefined;
    if (last) {
      return { rateMicro: BigInt(last.rateMicro), date: last.date, provider, stale: true };
    }
    throw err;
  }
}

/** Zuletzt bekannter Kurs (offline), oder null. */
export async function lastKnownRate(provider: FxProvider): Promise<FxRate | null> {
  const last = (await db.meta.get(lastKey(provider)))?.value as Stored | undefined;
  return last
    ? { rateMicro: BigInt(last.rateMicro), date: last.date, provider, stale: true }
    : null;
}
