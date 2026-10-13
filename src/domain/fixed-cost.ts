import { chooseRate, type KnownRate } from './fx';
import type { Entry, FixedCost } from './model';
import type { Currency } from './money';
import { addDays, occurrences } from './schedule';

// Fixkosten: Fälligkeiten, idempotente Buchung über deterministische Eintrags-ID, Autobook-Kandidaten.
// Die ID-Ableitung ist asynchron (crypto.subtle). Alle Funktionen, die IDs brauchen, sind asynchron;
// rein synchrone Verbraucher (z. B. income-split) bekommen die IDs vorberechnet als `OccurrenceIds`.

/** Autobook und „überfällig“ schauen höchstens so viele Tage zurück (heute eingeschlossen). */
export const LOOKBACK_DAYS = 35;

export type BookingState = 'open' | 'booked' | 'deleted';

export interface DueItem {
  fixedCostId: string;
  dueOn: string;
  /** Deterministische ID des Eintrags, den die Buchung dieser Fälligkeit anlegt. */
  entryId: string;
  state: BookingState;
}

/** Schlüssel einer Fälligkeit: `${fixedCostId}:${dueOn}`. */
export const occurrenceKey = (fixedCostId: string, dueOn: string): string =>
  `${fixedCostId}:${dueOn}`;

/** Vorberechnete Eintrags-IDs, Schlüssel = `occurrenceKey`. */
export type OccurrenceIds = ReadonlyMap<string, string>;

/**
 * Deterministische Eintrags-ID: SHA-256 über `${fixedCostId}:${dueOn}`, die ersten 16 Byte als UUID
 * (RFC 9562, Version 8 = benutzerdefiniert, Variante 10xx). Zwei Geräte erhalten dieselbe ID.
 */
export async function fixedCostEntryId(fixedCostId: string, dueOn: string): Promise<string> {
  const data = new TextEncoder().encode(occurrenceKey(fixedCostId, dueOn));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const b = hash.slice(0, 16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x80;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Zustand aus der ID: kein Eintrag = open, Eintrag da = booked, Eintrag gelöscht = deleted. */
export function bookingState(entryId: string, entries: readonly Entry[]): BookingState {
  const found = entries.find((e) => e.id === entryId);
  if (!found) return 'open';
  return found.deleted ? 'deleted' : 'booked';
}

const idCache = new Map<string, string>();
async function cachedEntryId(fixedCostId: string, dueOn: string): Promise<string> {
  const key = occurrenceKey(fixedCostId, dueOn);
  let id = idCache.get(key);
  if (id === undefined) {
    id = await fixedCostEntryId(fixedCostId, dueOn);
    idCache.set(key, id);
  }
  return id;
}

/**
 * Abdeckung durch verwaiste Einträge: je Fixkosten das späteste `bookedOn` unter den Fixkosten-Einträgen
 * (`source: 'fixed'`, auch gelöschte), deren ID zu KEINER Fälligkeit der aktuellen Regel gehört (Überbleibsel einer
 * geänderten Terminregel). Fälligkeiten bis einschließlich diesem Tag gelten als abgedeckt. Einträge mit der ID einer
 * aktuellen Fälligkeit markieren nur diese selbst (gebucht/gelöscht), ihr `bookedOn` deckt nichts anderes ab.
 * `to`: spätester Tag, den der Aufrufer betrachtet; die Fälligkeits-IDs der Regel werden ab `startsOn` bis
 * zum späteren aus `to` und dem letzten Buchungstag plus 400 Tage berechnet (früh gebuchte Zukunftstermine bleiben
 * so als aktuell erkennbar). Ergebnis nur für Fixkosten mit Treffer.
 */
export async function coverageByFixedCost(
  fixedCosts: readonly FixedCost[],
  entries: readonly Entry[],
  to: string,
): Promise<Map<string, string>> {
  const byFc = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.source !== 'fixed' || !e.fixedCostId) continue;
    const list = byFc.get(e.fixedCostId);
    if (list) list.push(e);
    else byFc.set(e.fixedCostId, [e]);
  }
  const covered = new Map<string, string>();
  for (const fc of fixedCosts) {
    const list = byFc.get(fc.id);
    if (!list) continue;
    const latest = list.reduce((m, e) => (e.bookedOn > m ? e.bookedOn : m), '');
    const end = addDays(latest > to ? latest : to, 400);
    const current = new Set<string>();
    for (const dueOn of occurrences(fc, fc.startsOn, end))
      current.add(await cachedEntryId(fc.id, dueOn));
    let cover = '';
    for (const e of list) if (!current.has(e.id) && e.bookedOn > cover) cover = e.bookedOn;
    if (cover) covered.set(fc.id, cover);
  }
  return covered;
}

/**
 * Alle Fälligkeiten der (nicht gelöschten) Fixkosten in `from`..`to` mit ID und Zustand, nach Datum sortiert.
 * Eine offene Fälligkeit, die durch einen verwaisten Eintrag abgedeckt ist (`coverageByFixedCost`), gilt als `booked`:
 * so bucht eine geänderte Terminregel (z. B. anderer Starttag) keinen Zeitraum doppelt.
 */
export async function dueWithIds(
  fixedCosts: readonly FixedCost[],
  entries: readonly Entry[],
  from: string,
  to: string,
): Promise<DueItem[]> {
  const covered = await coverageByFixedCost(
    fixedCosts.filter((f) => !f.deleted),
    entries,
    to,
  );
  const items: DueItem[] = [];
  for (const fc of fixedCosts) {
    if (fc.deleted) continue;
    for (const dueOn of occurrences(fc, from, to)) {
      const entryId = await cachedEntryId(fc.id, dueOn);
      let state = bookingState(entryId, entries);
      if (state === 'open' && dueOn <= (covered.get(fc.id) ?? '')) state = 'booked';
      items.push({ fixedCostId: fc.id, dueOn, entryId, state });
    }
  }
  return items.sort(
    (a, b) => a.dueOn.localeCompare(b.dueOn) || a.fixedCostId.localeCompare(b.fixedCostId),
  );
}

/** IDs aller Fälligkeiten in `from`..`to` (auch gelöschter Fixkosten), für synchrone Verbraucher. */
export async function occurrenceIds(
  fixedCosts: readonly FixedCost[],
  from: string,
  to: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const fc of fixedCosts) {
    for (const dueOn of occurrences(fc, from, to)) {
      map.set(occurrenceKey(fc.id, dueOn), await fixedCostEntryId(fc.id, dueOn));
    }
  }
  return map;
}

/**
 * „Als Nächstes fällig“: offene Fälligkeiten der letzten 35 Tage (überfällige, heute eingeschlossen) bis `today + horizonDays`,
 * nach Datum sortiert. Gebuchte und gelöschte Buchungen erscheinen nicht.
 */
export async function dueNext(
  fixedCosts: readonly FixedCost[],
  entries: readonly Entry[],
  today: string,
  horizonDays: number,
): Promise<DueItem[]> {
  const items = await dueWithIds(
    fixedCosts,
    entries,
    addDays(today, -(LOOKBACK_DAYS - 1)),
    addDays(today, horizonDays),
  );
  return items.filter((i) => i.state === 'open');
}

/**
 * Fälligkeiten, die beim Start bzw. nach dem Sync automatisch gebucht werden: `autobook`, Fälligkeit in
 * in den letzten 35 Tagen (heute eingeschlossen) bis `today`, Zustand `open`. Ein gelöschter gebuchter Eintrag (`deleted`) wird NICHT neu gebucht.
 */
export async function autobookCandidates(
  fixedCosts: readonly FixedCost[],
  entries: readonly Entry[],
  today: string,
): Promise<DueItem[]> {
  const auto = fixedCosts.filter((fc) => fc.autobook && !fc.deleted);
  const items = await dueWithIds(auto, entries, addDays(today, -(LOOKBACK_DAYS - 1)), today);
  return items.filter((i) => i.state === 'open');
}

export interface BookingDraft {
  amountMinor: number;
  currency: Currency;
  bookedOn: string;
  categoryId: string;
  source: 'fixed';
  fixedCostId: string;
  fxRateMicro: number;
  fxRateDate: string;
  fxProvisional: boolean;
}

/**
 * Felder des zu schreibenden Eintrags. `id` ist `DueItem.entryId`, `paidBy` liefert der Aufrufer.
 * `null`, wenn die Fixkosten in EUR sind und kein Kurs bekannt ist.
 */
export function bookingDraft(
  fixedCost: FixedCost,
  dueOn: string,
  rate: KnownRate | null,
  today: string,
): BookingDraft | null {
  const choice = chooseRate(fixedCost.currency, dueOn, rate);
  if (!choice) return null;
  // Veralteter Kurs (Rückfall) ist nie endgültig. Für heute oder die Zukunft gilt das auch, wenn der Anbieter ein
  // früheres Datum liefert (Tageskurs noch nicht veröffentlicht): der Kursnachzug holt ihn nach. Für vergangene
  // Tage ist die Antwort mit früherem Datum (Wochenende, Feiertag) endgültig.
  const provisional =
    choice.provisional ||
    (fixedCost.currency === 'EUR' && rate !== null && dueOn >= today && rate.date !== dueOn);
  return {
    amountMinor: fixedCost.amountMinor,
    currency: fixedCost.currency,
    bookedOn: dueOn,
    categoryId: fixedCost.categoryId,
    source: 'fixed',
    fixedCostId: fixedCost.id,
    fxRateMicro: choice.rateMicro,
    fxRateDate: choice.rateDate,
    fxProvisional: provisional,
  };
}

/**
 * Standard-Zahler gebuchter Fixkosten: Mitglied mit der kleinsten Nutzer-ID. Auf jedem Gerät derselbe Wert,
 * damit gleichzeitige Buchungen identische Felder schreiben. `null` ohne Mitglieder.
 */
export const defaultPayer = (members: readonly { userId: string }[]): string | null =>
  members.map((m) => m.userId).sort()[0] ?? null;
